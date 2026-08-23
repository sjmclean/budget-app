import type {
  AccountRegisterQueryClient,
  TransactionWriteInput,
} from "../accountRegisterQueryContracts";
import type { BudgetLifecycleControlPlaneClient } from "./budgetLifecycleControlPlaneClient";
import type { AccountTransactionQuery } from "../../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import {
  emptyDomainCounts,
  LOCAL_BUDGET_SCHEMA_VERSION,
  type LocalBudgetMutation,
  type LocalBudgetOperationGroup,
  type LocalFirstStoredConflict,
} from "./contracts";
import type { BudgetDomain } from "./contracts";
import { LocalBudgetDatabaseClient } from "./localBudgetClient";
import type {
  LocalTransactionAttachmentMutationPayload,
  LocalTransactionAttachmentRecord,
  LocalPayeeRecord,
  LocalTransactionRecord,
  TransactionHistorySnapshot,
} from "./registerSchema";
import { createLocalFirstRelayTransport } from "./relayTransport";
import { bootstrapLocalBudget } from "./baselineCoordinator";
import { publishLocalBaseline } from "./baselineCoordinator";
import type { BudgetMonthView } from "../../budget/budgetViewTypes";
import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../../accounts/scheduledTransactionTypes";
import {
  normaliseSpecificDates,
} from "../../accounts/scheduledTransactionRecurrence";
import {
  advanceScheduledTransaction,
  buildScheduledTransaction,
} from "../../accounts/scheduledTransactionLifecycle";
import { scheduledTransactionToRegisterInput } from "../../accounts/scheduledTransactionToRegisterInput";
import type { TransactionTagDefinition } from "../../tags/transactionTagTypes";
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";
import type { ReplicationConflict } from "../conflictResolution";
import {
  createLocalFirstTabSyncCoordinator,
  type LocalFirstTabSyncCoordinator,
} from "./tabSyncCoordinator";
import { notifyLocalFirstMutationCommitted } from "./mutationEvents";
import { registerLocalSqliteAttachmentReader } from "../../attachments/localSqliteAttachmentReader";
import { localPayeeRecordToView } from "./localPayeeView";
import { validatePayeeIconReferenceForWrite } from "../../icons/payeeIconReference";

const DEVICE_ID_KEY = "budget-app.local-first.device-id";
const SYNC_EPOCH_KEY_PREFIX = "budget-app.local-first.sync-epoch.";
export const BUDGET_ENGINE_DIAGNOSTIC_STORAGE_KEY =
  "budget-app.local-first.budget-engine-diagnostics";

export interface LocalFirstRegisterRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly databaseFactory?: () => LocalBudgetDatabaseClient;
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
  readonly tabSyncCoordinator?: LocalFirstTabSyncCoordinator;
}

/**
 * Complete browser-local budget engine. All domain reads and writes use the
 * OPFS SQLite worker. Only explicit catalogue/backup lifecycle operations are
 * delegated to the narrow control-plane client.
 */
export function createLocalFirstAccountRegisterQueryClient(
  lifecycle: BudgetLifecycleControlPlaneClient,
  options: LocalFirstRegisterRuntimeOptions = {},
): AccountRegisterQueryClient {
  const relay = createLocalFirstRelayTransport({ apiBaseUrl: options.apiBaseUrl });
  const storage = options.storage ?? globalThis.localStorage;
  const deviceId = readOrCreateDeviceId(storage);
  const tabSyncCoordinator =
    options.tabSyncCoordinator ?? createLocalFirstTabSyncCoordinator();
  const sequenceKey = `budget-app.local-first.device-sequence.${deviceId}`;
  let database: LocalBudgetDatabaseClient | null = null;
  let activeBudgetId: string | null = null;
  let activeSyncEpoch: string | null = null;
  let activePulledCursor = 0;
  let opening: Promise<LocalBudgetDatabaseClient | null> | null = null;
  let deviceSequence = Number(storage.getItem(sequenceKey) ?? "0");
  if (!Number.isSafeInteger(deviceSequence) || deviceSequence < 0) deviceSequence = 0;
  let synchronising: {
    readonly budgetId: string;
    readonly promise: Promise<void>;
  } | null = null;

  async function drainLocalOutbox(
    local: LocalBudgetDatabaseClient,
    budgetId: string,
    syncEpoch: string,
  ): Promise<void> {
    const utf8Encoder = new TextEncoder();

    while (true) {
      const pending = await local.readOutbox(0, 500);
      const outbox: (typeof pending)[number][] = [];
      let encodedBytes = 0;
      for (const row of pending) {
        const rowBytes =
          utf8Encoder.encode(row.payloadJson).byteLength + 2_048;
        if (outbox.length > 0 && encodedBytes + rowBytes > 32 * 1024 * 1024) break;
        outbox.push(row);
        encodedBytes += rowBytes;
      }
      if (outbox.length === 0) break;
      await relay.pushMutations({
        budgetId,
        syncEpoch,
        mutations: outbox.map((row) => ({
          mutationId: row.mutationId,
          operationGroupId: row.operationGroupId ?? undefined,
          operationGroup: row.operationGroupJson
            ? JSON.parse(row.operationGroupJson)
            : undefined,
          budgetId,
          syncEpoch,
          deviceId: row.deviceId,
          deviceSequence: row.deviceSequence,
          baseCursor: row.baseCursor,
          domain: row.domain,
          entityId: row.entityId,
          operation: row.operation,
          payload: JSON.parse(row.payloadJson),
          createdAt: row.createdAt,
        })),
      });
      await local.acknowledgeOutbox(outbox.at(-1)!.sequence);
    }
  }

  async function readyDatabase(budgetId: string): Promise<LocalBudgetDatabaseClient | null> {
    if (database && activeBudgetId === budgetId) return database;
    if (opening) return opening;
    opening = (async () => {
      const remote = await relay.getBootstrap(budgetId).catch(() => null);
      await database?.close().catch(() => undefined);
      const next =
        options.databaseFactory?.() ??
        new LocalBudgetDatabaseClient(undefined, storage);
      const cachedSyncEpoch = storage.getItem(
        `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
      );
      let oldGenerationProvenSafe = false;

      if (!remote) {
        if (!cachedSyncEpoch) return null;
        try {
          await next.open({
            budgetId,
            syncEpoch: cachedSyncEpoch,
            deviceId,
          });
          activePulledCursor = (await next.getSyncState()).pulledCursor;
          database = next;
          activeBudgetId = budgetId;
          activeSyncEpoch = cachedSyncEpoch;
          return next;
        } catch (error) {
          await next.close().catch(() => undefined);
          throw error;
        }
      }
      if (!remote.baseline || remote.schemaVersion !== LOCAL_BUDGET_SCHEMA_VERSION) {
        return null;
      }

      if (cachedSyncEpoch && cachedSyncEpoch !== remote.syncEpoch) {
        await next.open({
          budgetId,
          syncEpoch: cachedSyncEpoch,
          deviceId,
        });
        const pendingOldGeneration = await next.readOutbox(0, 1);
        if (pendingOldGeneration.length > 0) {
          await next.close().catch(() => undefined);
          throw Object.assign(
            new Error(
              "This device has unsynced local changes from the previous sync generation. " +
              "They must be recovered explicitly before rebuilding from the relay.",
            ),
            { code: "UNSYNCED_LOCAL_CHANGES" },
          );
        }

        oldGenerationProvenSafe = true;
      }

      try {
        const local = await next.open({
          budgetId,
          syncEpoch: remote.syncEpoch,
          deviceId,
        });
        const syncState = await next.getSyncState();
        activePulledCursor = syncState.pulledCursor;
        if (
          syncState.baselineHash !== remote.baseline.manifest.contentHash ||
          syncState.pulledCursor < remote.baseline.manifest.baseCursor ||
          local.counts.accounts !== remote.baseline.manifest.counts.accounts ||
          local.counts.transactions !== remote.baseline.manifest.counts.transactions
        ) {
          await drainLocalOutbox(next, budgetId, remote.syncEpoch);
          await bootstrapLocalBudget({
            budgetId,
            deviceId,
            database: next,
            relay,
            localState: syncState.baselineHash ? {
              budgetId,
              syncEpoch: syncState.syncEpoch,
              baselineHash: syncState.baselineHash,
              pulledCursor: syncState.pulledCursor,
            } : null,
          });
          activePulledCursor = (await next.getSyncState()).pulledCursor;
        }
        database = next;
        activeBudgetId = budgetId;
        activeSyncEpoch = remote.syncEpoch;
        storage.setItem(
          `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
          remote.syncEpoch,
        );
        return next;
      } catch (error) {
        if ((error as { code?: string }).code === "STALE_SYNC_EPOCH") {
          if (!oldGenerationProvenSafe) {
            await next.close().catch(() => undefined);
            throw Object.assign(
              new Error(
                "The local SQLite budget belongs to an unexpected previous sync generation. " +
                "Its unsynced changes could not be inspected safely, so automatic rebuild was refused.",
              ),
              { code: "UNVERIFIED_STALE_LOCAL_GENERATION" },
            );
          }

          await bootstrapLocalBudget({
            budgetId,
            deviceId,
            database: next,
            relay,
            localState: null,
          });
          activePulledCursor = (await next.getSyncState()).pulledCursor;
          database = next;
          activeBudgetId = budgetId;
          activeSyncEpoch = remote.syncEpoch;
          storage.setItem(
            `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
            remote.syncEpoch,
          );
          return next;
        }
        await next.close().catch(() => undefined);
        throw error;
      }
    })().finally(() => {
      opening = null;
    });
    return opening;
  }

  async function requireDatabase(budgetId: string) {
    const ready = await readyDatabase(budgetId);
    if (!ready || !activeSyncEpoch) {
      throw new Error("The complete local SQLite budget is not ready on this device.");
    }
    return ready;
  }

  async function synchronise(budgetId: string): Promise<void> {
    if (synchronising) {
      if (synchronising.budgetId === budgetId) return synchronising.promise;
      await synchronising.promise;
      return synchronise(budgetId);
    }
    const operation = tabSyncCoordinator.run(budgetId, async () => {
      const local = await requireDatabase(budgetId);
      await drainLocalOutbox(local, budgetId, activeSyncEpoch!);
      let cursor = (await local.getSyncState()).pulledCursor;
      while (true) {
        let pulled;
        try {
          pulled = await relay.pullMutations({
            budgetId,
            syncEpoch: activeSyncEpoch!,
            afterCursor: cursor,
            limit: 500,
          });
        } catch (error) {
          if ((error as { code?: string }).code !== "CURSOR_COMPACTED") {
            throw error;
          }
          const syncState = await local.getSyncState();
          const rebuilt = await bootstrapLocalBudget({
            budgetId,
            deviceId,
            database: local,
            relay,
            localState: syncState.baselineHash ? {
              budgetId,
              syncEpoch: syncState.syncEpoch,
              baselineHash: syncState.baselineHash,
              pulledCursor: syncState.pulledCursor,
            } : null,
          });
          if (!rebuilt.deviceState) {
            throw new Error("The compacted relay has no restorable baseline.");
          }
          cursor = rebuilt.deviceState.pulledCursor;
          activePulledCursor = cursor;
          continue;
        }
        if (pulled.mutations.length > 0) {
          const throughCursor = pulled.mutations.at(-1)!.cursor;
          await local.applyRemoteMutations(
            pulled.mutations.map(({
              cursor: mutationCursor,
              mutation: value,
              conflict,
            }) => ({
              cursor: mutationCursor,
              mutation: value,
              ...(conflict ? { conflict } : {}),
            })),
            throughCursor,
          );
          cursor = throughCursor;
          activePulledCursor = throughCursor;
        }
        if (!pulled.hasMore) break;
      }
    }).finally(() => {
      if (synchronising?.promise === operation) synchronising = null;
    });
    synchronising = { budgetId, promise: operation };
    return operation;
  }

  async function syncThenDatabase(budgetId: string) {
    await synchronise(budgetId);
    return requireDatabase(budgetId);
  }

  function mutation(
    budgetId: string,
    domain: BudgetDomain,
    entityId: string,
    operation: "upsert" | "delete",
    payload: unknown,
    operationGroupId?: string,
    operationGroup?: LocalBudgetOperationGroup,
  ): LocalBudgetMutation {
    deviceSequence += 1;
    storage.setItem(sequenceKey, String(deviceSequence));
    return {
      mutationId: createRuntimeUuid(),
      ...(operationGroupId ? { operationGroupId } : {}),
      ...(operationGroup ? { operationGroup } : {}),
      budgetId,
      syncEpoch: activeSyncEpoch!,
      deviceId,
      deviceSequence,
      baseCursor: activePulledCursor,
      domain,
      entityId,
      operation,
      payload,
      createdAt: new Date().toISOString(),
    };
  }

  function encodeBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 32 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function writeEntity(
    budgetId: string,
    domain: BudgetDomain,
    entityId: string,
    payload: unknown,
    operation: "upsert" | "delete" = "upsert",
  ) {
    const local = await requireDatabase(budgetId);
    await local.mutate(mutation(budgetId, domain, entityId, operation, payload));
    notifyLocalFirstMutationCommitted(budgetId);
  }

  async function listSchedules(
    budgetId: string,
    accountId: string,
    syncBeforeRead = true,
  ) {
    if (syncBeforeRead) await synchronise(budgetId);
    return (await requireDatabase(budgetId))
      .listEntities<ScheduledTransactionView>("scheduledTransactions")
      .then((rows) => rows
        .filter((row) => row.accountId === accountId)
        .sort((left, right) =>
          left.nextDueDate.localeCompare(right.nextDueDate) || left.id.localeCompare(right.id)));
  }

  async function captureSchedule(
    budgetId: string,
    scheduleId: string,
    syncBeforeRead = true,
  ): Promise<ScheduledTransactionView | null> {
    if (syncBeforeRead) await synchronise(budgetId);
    const schedules = await (await requireDatabase(budgetId))
      .listEntities<ScheduledTransactionView>("scheduledTransactions");
    return schedules.find(({ id }) => id === scheduleId) ?? null;
  }

  function scheduledRegisterWrite(
    budgetId: string,
    accountId: string,
    schedule: ScheduledTransactionView,
  ): TransactionWriteInput {
    const input = scheduledTransactionToRegisterInput(schedule);
    return {
      budgetId,
      accountId,
      date: input.date,
      amount: Math.round((input.inflow - input.outflow) * 100),
      payeeId: input.payeeId,
      payeeName: input.payee,
      transferAccountId: input.transferAccountId,
      categoryId: input.categoryId,
      categoryName: input.category,
      memo: input.memo,
      tagIds: input.tagIds,
      generatedFromSchedule: true,
      scheduledTransactionId: schedule.id,
      scheduledOccurrenceDate: input.scheduledOccurrenceDate,
      splitLines: (input.splitLines ?? []).map((line) => ({
        id: line.id,
        categoryId: line.categoryId,
        categoryName: line.category,
        transferAccountId: line.transferAccountId,
        transferTransactionId: line.transferTransactionId,
        memo: line.memo,
        amount: Math.round((line.inflow - line.outflow) * 100),
      })),
    };
  }

  async function listLocalAccounts(budgetId: string) {
    return (await requireDatabase(budgetId)).listAccountNavigation(budgetId)
      .then((rows) => rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as never,
        startingBalance: row.openingBalance / 100,
        isClosed: row.closedAt !== null,
        createdAt: row.closedAt ?? new Date(0).toISOString(),
        closedAt: row.closedAt ?? undefined,
      })));
  }

  async function listPersistedPayees(budgetId: string, archived: boolean) {
    const rows = await (await requireDatabase(budgetId)).listPayees(budgetId, archived);
    return rows.map(localPayeeRecordToView);
  }

  async function transactionRecord(
    id: string,
    input: TransactionWriteInput,
    existing?: LocalTransactionRecord | null,
  ): Promise<LocalTransactionRecord> {
    return {
      id,
      budgetId: input.budgetId,
      accountId: input.accountId,
      date: input.date,
      amount: input.amount,
      memo: input.memo ?? null,
      checkNumber: input.checkNumber ?? null,
      clearedStatus: existing?.clearedStatus ?? "uncleared",
      payeeId: input.payeeId ?? null,
      payeeName: input.payeeName ?? null,
      rawPayeeName: input.rawPayee ?? existing?.rawPayeeName ?? null,
      categoryId: input.categoryId ?? null,
      categoryName:
        input.categoryName?.trim() ||
        (existing?.categoryId === input.categoryId ? existing?.categoryName : null) ||
        (input.transferAccountId ? "Transfer" : null),
      transferAccountId:
        input.transferAccountId ?? existing?.transferAccountId ?? null,
      transferTransactionId: existing?.transferTransactionId ?? null,
      generatedFromSchedule: input.generatedFromSchedule ?? existing?.generatedFromSchedule ?? false,
      scheduledTransactionId: input.scheduledTransactionId ?? existing?.scheduledTransactionId ?? null,
      scheduledOccurrenceDate: input.scheduledOccurrenceDate ?? existing?.scheduledOccurrenceDate ?? null,
      splitLines: (input.splitLines ?? []).map((split) => ({
        id: split.id,
        categoryId: split.categoryId ?? null,
        categoryName: split.transferAccountId
          ? "Transfer"
          : split.categoryName?.trim() || null,
        transferAccountId: split.transferAccountId ?? null,
        transferTransactionId: split.transferTransactionId ?? null,
        memo: split.memo ?? null,
        amount: split.amount,
      })),
      tagIds: input.tagIds ?? [],
      importProvenance: existing?.importProvenance ?? [],
      updatedAt: new Date().toISOString(),
    };
  }

  function requireMutableTransaction(
    transaction: LocalTransactionRecord,
  ): void {
    if (transaction.clearedStatus === "reconciled") {
      throw new Error(
        "Reconciled transactions are locked and cannot be changed.",
      );
    }
  }

  async function requireTransferCounterpart(
    local: LocalBudgetDatabaseClient,
    transaction: LocalTransactionRecord,
  ): Promise<LocalTransactionRecord | null> {
    const hasTransferAccount = Boolean(transaction.transferAccountId);
    const hasTransferTransaction = Boolean(transaction.transferTransactionId);

    if (!hasTransferAccount && !hasTransferTransaction) {
      return null;
    }

    if (!transaction.transferAccountId || !transaction.transferTransactionId) {
      throw new Error(
        "The transfer linkage is incomplete. Repair the transfer before changing it.",
      );
    }

    const counterpart = await local.getTransaction(
      transaction.budgetId,
      transaction.transferTransactionId,
    );

    if (
      !counterpart ||
      counterpart.accountId !== transaction.transferAccountId ||
      counterpart.transferAccountId !== transaction.accountId ||
      counterpart.transferTransactionId !== transaction.id
    ) {
      throw new Error(
        "The other side of this transfer is missing or does not link back correctly.",
      );
    }

    return counterpart;
  }

  async function findReciprocalTransferCounterpartForDelete(
    local: LocalBudgetDatabaseClient,
    transaction: LocalTransactionRecord,
  ): Promise<LocalTransactionRecord | null> {
    if (
      !transaction.transferAccountId ||
      !transaction.transferTransactionId
    ) {
      return null;
    }

    const counterpart = await local.getTransaction(
      transaction.budgetId,
      transaction.transferTransactionId,
    );

    if (
      !counterpart ||
      counterpart.accountId !== transaction.transferAccountId ||
      counterpart.transferAccountId !== transaction.accountId ||
      counterpart.transferTransactionId !== transaction.id
    ) {
      return null;
    }

    return counterpart;
  }

  async function accountParticipation(
    local: LocalBudgetDatabaseClient,
    budgetId: string,
    accountId: string,
  ): Promise<"on-budget" | "off-budget"> {
    const account = (await local.listAccountNavigation(budgetId))
      .find((candidate) => candidate.id === accountId);
    if (!account) throw new Error(`Transfer account ${accountId} was not found.`);
    return account.participation === "on-budget" ? "on-budget" : "off-budget";
  }

  async function applyTransferCategorySemantics(
    local: LocalBudgetDatabaseClient,
    source: LocalTransactionRecord,
    counterpart: LocalTransactionRecord,
  ): Promise<readonly [LocalTransactionRecord, LocalTransactionRecord]> {
    const [sourceParticipation, counterpartParticipation] = await Promise.all([
      accountParticipation(local, source.budgetId, source.accountId),
      accountParticipation(local, counterpart.budgetId, counterpart.accountId),
    ]);
    const internal =
      sourceParticipation === "on-budget" &&
      counterpartParticipation === "on-budget";

    return [
      {
        ...source,
        categoryId:
          internal || sourceParticipation === "off-budget" ? null : source.categoryId,
        categoryName:
          internal || sourceParticipation === "off-budget"
            ? "Transfer"
            : source.categoryName,
      },
      {
        ...counterpart,
        categoryId:
          internal || counterpartParticipation === "off-budget"
            ? null
            : counterpart.categoryId,
        categoryName:
          internal || counterpartParticipation === "off-budget"
            ? "Transfer"
            : counterpart.categoryName,
      },
    ];
  }

  async function buildTransferPair(
    local: LocalBudgetDatabaseClient,
    source: LocalTransactionRecord,
    targetAccountId: string,
    counterpartId = createRuntimeUuid(),
  ): Promise<readonly [LocalTransactionRecord, LocalTransactionRecord]> {
    if (targetAccountId === source.accountId) {
      throw new Error("A transfer cannot use the same account on both sides.");
    }

    const sourceRecord: LocalTransactionRecord = {
      ...source,
      transferAccountId: targetAccountId,
      transferTransactionId: counterpartId,
    };

    const counterpartRecord: LocalTransactionRecord = {
      ...sourceRecord,
      id: counterpartId,
      accountId: targetAccountId,
      amount: -sourceRecord.amount,
      clearedStatus: "uncleared",
      categoryId: sourceRecord.categoryId,
      categoryName: sourceRecord.categoryName,
      transferAccountId: sourceRecord.accountId,
      transferTransactionId: sourceRecord.id,
      importProvenance: [],
    };

    return applyTransferCategorySemantics(local, sourceRecord, counterpartRecord);
  }

  async function buildNewTransactionRecords(
    local: LocalBudgetDatabaseClient,
    id: string,
    input: TransactionWriteInput,
  ): Promise<readonly LocalTransactionRecord[]> {
    const record = await transactionRecord(id, input);

    if (!input.transferAccountId) {
      return [record];
    }

    return buildTransferPair(local, record, input.transferAccountId);
  }

  async function buildUpdatedTransactionRecords(
    local: LocalBudgetDatabaseClient,
    transactionId: string,
    input: TransactionWriteInput,
    existing: LocalTransactionRecord,
  ): Promise<readonly LocalTransactionRecord[]> {
    requireMutableTransaction(existing);

    const counterpart = await requireTransferCounterpart(local, existing);
    if (counterpart) requireMutableTransaction(counterpart);

    if (!counterpart) {
      const record = await transactionRecord(transactionId, input, existing);
      if (!input.transferAccountId) return [record];
      return buildTransferPair(local, record, input.transferAccountId);
    }

    if (input.accountId !== existing.accountId) {
      throw new Error(
        "This transfer cannot be moved by editing it. Move the transaction between accounts instead.",
      );
    }
    if (
      input.transferAccountId !== undefined &&
      input.transferAccountId !== existing.transferAccountId
    ) {
      throw new Error(
        "This transfer cannot be retargeted by editing it. Move the transaction between accounts instead.",
      );
    }

    const record: LocalTransactionRecord = {
      ...(await transactionRecord(transactionId, input, existing)),
      transferAccountId: existing.transferAccountId,
      transferTransactionId: existing.transferTransactionId,
    };
    const counterpartRecord: LocalTransactionRecord = {
      ...counterpart,
      date: record.date,
      amount: -record.amount,
      memo: record.memo,
      checkNumber: record.checkNumber,
      transferAccountId: record.accountId,
      transferTransactionId: record.id,
      updatedAt: record.updatedAt,
    };
    return applyTransferCategorySemantics(local, record, counterpartRecord);
  }

  function transactionWrite(
    record: LocalTransactionRecord,
    operationGroupId?: string,
    operationGroup?: LocalBudgetOperationGroup,
  ): {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
  } {
    return {
      transaction: record,
      mutation: mutation(
        record.budgetId,
        "transactions",
        record.id,
        "upsert",
        record,
        operationGroupId,
        operationGroup,
      ),
    };
  }

  function transactionWrites(
    records: readonly LocalTransactionRecord[],
  ): readonly {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
  }[] {
    if (
      records.length === 2 &&
      records[0].transferTransactionId === records[1].id &&
      records[1].transferTransactionId === records[0].id
    ) {
      const operationGroupId = createRuntimeUuid();
      const operationGroup: LocalBudgetOperationGroup = {
        members: records.map((record) => ({
          domain: "transactions",
          entityId: record.id,
          operation: "upsert",
          payload: record,
        })),
      };
      return records.map((record) =>
        transactionWrite(record, operationGroupId, operationGroup));
    }

    return records.map((record) => transactionWrite(record));
  }

  function transactionWritesAsSingleOperationGroup(
    records: readonly LocalTransactionRecord[],
  ): readonly {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
  }[] {
    if (records.length === 0) return [];
    const operationGroupId = createRuntimeUuid();
    const operationGroup: LocalBudgetOperationGroup = {
      members: records.map((record) => ({
        domain: "transactions",
        entityId: record.id,
        operation: "upsert",
        payload: record,
      })),
    };
    return records.map((record) =>
      transactionWrite(record, operationGroupId, operationGroup));
  }

  function scheduledHistoryMembers(input: {
    readonly scheduleId: string;
    readonly expectedSchedule: ScheduledTransactionView | null;
    readonly replacementSchedule: ScheduledTransactionView | null;
    readonly expectedTransaction: TransactionHistorySnapshot | null;
    readonly replacementTransaction: TransactionHistorySnapshot | null;
  }): LocalBudgetOperationGroup["members"] {
    const nextTransactionIds = new Set(
      input.replacementTransaction?.transactions.map(({ id }) => id) ?? [],
    );
    const nextAttachmentIds = new Set(
      input.replacementTransaction?.attachments.map(({ id }) => id) ?? [],
    );
    return [
      {
        domain: "scheduledTransactions" as const,
        entityId: input.scheduleId,
        operation: input.replacementSchedule ? "upsert" as const : "delete" as const,
        payload: input.replacementSchedule,
      },
      ...(input.expectedTransaction?.transactions ?? [])
        .filter(({ id }) => !nextTransactionIds.has(id))
        .map((transaction) => ({
          domain: "transactions" as const,
          entityId: transaction.id,
          operation: "delete" as const,
          payload: { accountId: transaction.accountId, amount: transaction.amount,
            transferAccountId: transaction.transferAccountId, transferTransactionId: transaction.transferTransactionId },
        })),
      ...(input.expectedTransaction?.attachments ?? [])
        .filter(({ id }) => !nextAttachmentIds.has(id))
        .map((attachment) => ({
          domain: "transactions" as const,
          entityId: `attachment:${attachment.id}`,
          operation: "delete" as const,
          payload: { kind: "transaction-attachment-delete" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment) },
        })),
      ...(input.replacementTransaction?.transactions ?? []).map((transaction) => ({
        domain: "transactions" as const,
        entityId: transaction.id,
        operation: "upsert" as const,
        payload: transaction,
      })),
      ...(input.replacementTransaction?.attachments ?? []).map((attachment) => ({
        domain: "transactions" as const,
        entityId: `attachment:${attachment.id}`,
        operation: "upsert" as const,
        payload: { kind: "transaction-attachment-upsert" as const,
          attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
          contentBase64: encodeBase64(attachment.content) },
      })),
    ];
  }

  type TransactionBatchPreparationInput = Pick<
    Parameters<AccountRegisterQueryClient["commitImportBatch"]>[0],
    | "budgetId"
    | "accountId"
    | "additions"
    | "updates"
    | "provenanceAssignments"
  >;

  async function prepareTransactionBatchWrites(
    local: LocalBudgetDatabaseClient,
    input: TransactionBatchPreparationInput,
  ): Promise<{
    readonly writes: {
      readonly transaction: LocalTransactionRecord;
      readonly mutation: LocalBudgetMutation;
    }[];
    readonly requireAbsentTransactionIds: string[];
  }> {
    const writes: {
      transaction: LocalTransactionRecord;
      mutation: LocalBudgetMutation;
    }[] = [];
    const requireAbsentTransactionIds: string[] = [];
    const additionIds = new Set<string>();

    const provenanceByTransactionId = new Map<
      string,
      LocalTransactionRecord["importProvenance"][number][]
    >();

    for (const assignment of input.provenanceAssignments) {
      if (!assignment.transactionId.trim()) {
        throw new Error("Import provenance requires a transaction id.");
      }

      if (!assignment.identity.trim()) {
        throw new Error(
          `Import provenance for transaction ${assignment.transactionId} requires an identity.`,
        );
      }

      if (
        !Number.isInteger(assignment.occurrence) ||
        assignment.occurrence < 1
      ) {
        throw new Error(
          `Import provenance for transaction ${assignment.transactionId} has an invalid occurrence.`,
        );
      }

      const existingAssignments =
        provenanceByTransactionId.get(assignment.transactionId) ?? [];

      existingAssignments.push({
        fileType: assignment.fileType,
        identity: assignment.identity,
        occurrence: assignment.occurrence,
        importedAt: assignment.importedAt,
      });

      provenanceByTransactionId.set(
        assignment.transactionId,
        existingAssignments,
      );
    }

    const appendImportProvenance = (
      record: LocalTransactionRecord,
    ): LocalTransactionRecord => {
      const additions = provenanceByTransactionId.get(record.id);
      if (!additions || additions.length === 0) {
        return record;
      }

      const seen = new Set(
        record.importProvenance.map(
          (entry) =>
            `${entry.fileType}\u0000${entry.identity}\u0000${entry.occurrence}`,
        ),
      );

      const importProvenance = [...record.importProvenance];

      for (const entry of additions) {
        const key =
          `${entry.fileType}\u0000${entry.identity}\u0000${entry.occurrence}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        importProvenance.push(entry);
      }

      return {
        ...record,
        importProvenance,
      };
    };

    const provenanceAppliedTransactionIds = new Set<string>();

    for (const addition of input.additions) {
      if (additionIds.has(addition.id)) {
        throw new Error(
          `Transaction ${addition.id} appears more than once in the additions batch.`,
        );
      }

      additionIds.add(addition.id);

      const records = (
        await buildNewTransactionRecords(
          local,
          addition.id,
          addition,
        )
      ).map((record) => {
        const next = appendImportProvenance(record);

        if (next !== record) {
          provenanceAppliedTransactionIds.add(record.id);
        }

        return next;
      });

      requireAbsentTransactionIds.push(
        ...records.map((record) => record.id),
      );

      writes.push(...transactionWrites(records));
    }

    for (const update of input.updates) {
      const existing = await local.getTransaction(
        input.budgetId,
        update.id,
      );

      if (!existing) {
        throw new Error("The local transaction was not found.");
      }

      const records = (
        await buildUpdatedTransactionRecords(
          local,
          update.id,
          update,
          existing,
        )
      ).map((record) => {
        const next = appendImportProvenance(record);

        if (next !== record) {
          provenanceAppliedTransactionIds.add(record.id);
        }

        return next;
      });

      writes.push(...transactionWrites(records));
    }

    for (const [
      transactionId,
      assignments,
    ] of provenanceByTransactionId.entries()) {
      if (provenanceAppliedTransactionIds.has(transactionId)) {
        continue;
      }

      if (additionIds.has(transactionId)) {
        throw new Error(
          `Import provenance for new transaction ${transactionId} was not attached to its addition record.`,
        );
      }

      const existing = await local.getTransaction(
        input.budgetId,
        transactionId,
      );

      if (!existing) {
        throw new Error(
          `Import provenance targets missing transaction ${transactionId}.`,
        );
      }

      if (existing.accountId !== input.accountId) {
        throw new Error(
          `Import provenance targets transaction ${transactionId} outside the destination account.`,
        );
      }

      requireMutableTransaction(existing);

      const updated: LocalTransactionRecord =
        appendImportProvenance({
          ...existing,
          updatedAt: new Date().toISOString(),
        });

      if (
        updated.importProvenance.length ===
          existing.importProvenance.length &&
        assignments.length > 0
      ) {
        // Every requested provenance row was already represented. No write is
        // required, but the assignment is still valid and satisfied.
        provenanceAppliedTransactionIds.add(transactionId);
        continue;
      }

      provenanceAppliedTransactionIds.add(transactionId);
      writes.push(...transactionWrites([updated]));
    }

    for (const transactionId of provenanceByTransactionId.keys()) {
      if (!provenanceAppliedTransactionIds.has(transactionId)) {
        throw new Error(
          `Import provenance for transaction ${transactionId} was not applied.`,
        );
      }
    }

    return {
      writes,
      requireAbsentTransactionIds,
    };
  }

  function journalMutation(value: LocalBudgetMutation) {
    const key = `local-first/${value.domain}/${value.entityId}`;
    return value.operation === "delete"
      ? { type: "key-value.remove" as const, key }
      : {
          type: "key-value.set" as const,
          key,
          value: JSON.stringify(value.payload),
        };
  }

  async function replayGroupedTransferConflicts(
    local: LocalBudgetDatabaseClient,
    selectedConflict: LocalFirstStoredConflict,
    unresolvedConflicts: readonly LocalFirstStoredConflict[],
  ): Promise<void> {
    const selected = selectedConflict.losingMutation;
    const operationGroupId = selected.operationGroupId;
    const operationGroup = selected.operationGroup;

    if (!operationGroupId || !operationGroup) {
      throw new Error(
        "This transfer conflict cannot be kept locally because it predates atomic transfer conflict grouping.",
      );
    }

    if (operationGroup.members.length !== 2) {
      throw new Error(
        "A complete transfer operation snapshot is required before keep-local can replay this operation.",
      );
    }

    const [first, second] = operationGroup.members;

    if (
      first.entityId === second.entityId ||
      first.domain !== "transactions" ||
      second.domain !== "transactions" ||
      first.operation !== second.operation ||
      selected.domain !== "transactions" ||
      selected.operation !== first.operation ||
      !operationGroup.members.some(
        (member) =>
          member.entityId === selected.entityId &&
          member.domain === selected.domain &&
          member.operation === selected.operation,
      )
    ) {
      throw new Error(
        "The grouped transfer operation snapshot is inconsistent.",
      );
    }

    const groupedConflicts = unresolvedConflicts.filter(
      (conflict) =>
        conflict.losingMutation.operationGroupId === operationGroupId,
    );

    const operationGroupJson = JSON.stringify(operationGroup);
    const conflictByEntityId = new Map<string, LocalFirstStoredConflict>();

    for (const conflict of groupedConflicts) {
      const losing = conflict.losingMutation;
      const member = operationGroup.members.find(
        (value) => value.entityId === losing.entityId,
      );

      if (
        !member ||
        losing.budgetId !== selected.budgetId ||
        losing.syncEpoch !== selected.syncEpoch ||
        losing.deviceId !== selected.deviceId ||
        losing.domain !== member.domain ||
        losing.operation !== member.operation ||
        losing.operationGroupId !== operationGroupId ||
        !losing.operationGroup ||
        JSON.stringify(losing.operationGroup) !== operationGroupJson ||
        conflictByEntityId.has(losing.entityId)
      ) {
        throw new Error(
          "The grouped transfer conflicts do not describe one consistent local operation.",
        );
      }

      conflictByEntityId.set(losing.entityId, conflict);
    }

    if (!conflictByEntityId.has(selected.entityId)) {
      throw new Error(
        "The selected transfer conflict is not part of its stored logical operation.",
      );
    }

    const replayOperationGroupId = createRuntimeUuid();

    if (first.operation === "upsert") {
      const firstTransaction = first.payload as LocalTransactionRecord;
      const secondTransaction = second.payload as LocalTransactionRecord;

      if (
        firstTransaction.id !== first.entityId ||
        secondTransaction.id !== second.entityId ||
        firstTransaction.budgetId !== selected.budgetId ||
        secondTransaction.budgetId !== selected.budgetId ||
        firstTransaction.accountId === secondTransaction.accountId ||
        firstTransaction.transferTransactionId !== second.entityId ||
        secondTransaction.transferTransactionId !== first.entityId ||
        firstTransaction.transferAccountId !== secondTransaction.accountId ||
        secondTransaction.transferAccountId !== firstTransaction.accountId ||
        firstTransaction.amount !== -secondTransaction.amount
      ) {
        throw new Error(
          "The grouped transfer conflict pair has invalid reciprocal transfer data.",
        );
      }

      await local.writeTransactionBatch(
        operationGroup.members.map((member) => {
          const conflict = conflictByEntityId.get(member.entityId);
          return {
            transaction: member.payload as LocalTransactionRecord,
            mutation: mutation(
              selected.budgetId,
              member.domain,
              member.entityId,
              member.operation,
              member.payload,
              replayOperationGroupId,
              operationGroup,
            ),
            resolveConflictId: conflict?.conflictId,
          };
        }),
      );
      return;
    }

    const firstDelete = first.payload as {
      accountId?: string;
      amount?: number;
      transferAccountId?: string | null;
      transferTransactionId?: string | null;
    } | null;

    const secondDelete = second.payload as {
      accountId?: string;
      amount?: number;
      transferAccountId?: string | null;
      transferTransactionId?: string | null;
    } | null;

    if (
      !firstDelete ||
      !secondDelete ||
      typeof firstDelete.accountId !== "string" ||
      typeof secondDelete.accountId !== "string" ||
      typeof firstDelete.amount !== "number" ||
      typeof secondDelete.amount !== "number" ||
      firstDelete.accountId === secondDelete.accountId ||
      firstDelete.transferTransactionId !== second.entityId ||
      secondDelete.transferTransactionId !== first.entityId ||
      firstDelete.transferAccountId !== secondDelete.accountId ||
      secondDelete.transferAccountId !== firstDelete.accountId ||
      firstDelete.amount !== -secondDelete.amount
    ) {
      throw new Error(
        "The grouped transfer delete conflict pair lacks a valid reciprocal financial snapshot.",
      );
    }

    await local.deleteTransactionBatch(
      operationGroup.members.map((member) => {
        const conflict = conflictByEntityId.get(member.entityId);
        return {
          transactionId: member.entityId,
          mutation: mutation(
            selected.budgetId,
            member.domain,
            member.entityId,
            member.operation,
            member.payload,
            replayOperationGroupId,
            operationGroup,
          ),
          resolveConflictId: conflict?.conflictId,
        };
      }),
    );
  }

  async function replayConflictMutation(
    local: LocalBudgetDatabaseClient,
    original: LocalBudgetMutation,
    conflictId: string,
  ) {
    const replay = mutation(
      original.budgetId,
      original.domain,
      original.entityId,
      original.operation,
      original.payload,
    );
    if (
      original.domain === "transactions" &&
      original.entityId.startsWith("attachment:")
    ) {
      const payload = original.payload as LocalTransactionAttachmentMutationPayload;
      if (original.operation === "delete") {
        await local.deleteTransactionAttachment(payload.attachment.id, replay, conflictId);
      } else {
        if (!payload.contentBase64) throw new Error("Attachment conflict content is missing.");
        await local.writeTransactionAttachment(
          payload.attachment,
          decodeBase64(payload.contentBase64),
          replay,
          conflictId,
        );
      }
      return;
    }
    if (original.domain === "transactions") {
      if (original.operation === "delete") {
        const payload = original.payload as {
          transferAccountId?: string | null;
          transferTransactionId?: string | null;
        } | null;

        if (
          payload?.transferAccountId ||
          payload?.transferTransactionId
        ) {
          throw new Error(
            "This transfer conflict cannot be kept locally one side at a time. Accept the remote version or resolve the transfer pair together.",
          );
        }

        await local.deleteTransaction(original.entityId, replay, conflictId);
      } else {
        const transaction = original.payload as LocalTransactionRecord;

        if (
          transaction.transferAccountId ||
          transaction.transferTransactionId
        ) {
          throw new Error(
            "This transfer conflict cannot be kept locally one side at a time. Accept the remote version or resolve the transfer pair together.",
          );
        }

        await local.writeTransaction(transaction, replay, conflictId);
      }
      return;
    }
    if (original.domain === "accounts") {
      if (original.operation === "delete") {
        await local.deleteAccount(
          original.budgetId,
          original.entityId,
          replay,
          conflictId,
        );
      } else {
        await local.writeAccount(
          original.payload as import("./registerSchema").LocalAccountRecord,
          replay,
          conflictId,
        );
      }
      return;
    }
    if (original.domain === "payees" && original.operation === "upsert") {
      await local.writePayee(
        original.payload as import("./registerSchema").LocalPayeeRecord,
        replay,
        conflictId,
      );
      return;
    }
    if (original.domain === "payees" && original.operation === "delete") {
      const target = original.payload as {
        targetPayeeId?: string;
        targetPayeeName?: string;
        sourcePayeeIds?: readonly string[];
      };
      if (target.targetPayeeId) {
        await local.mergePayees({
          budgetId: original.budgetId,
          sourcePayeeId: original.entityId,
          sourcePayeeIds: target.sourcePayeeIds,
          targetPayeeId: target.targetPayeeId,
          targetPayeeName: target.targetPayeeName ?? "",
          mutation: replay,
          resolveConflictId: conflictId,
        });
        return;
      }
    }
    if (original.domain === "categories" && original.operation === "delete") {
      const target = original.payload as {
        targetCategoryId?: string;
        targetCategoryName?: string;
      };
      if (target.targetCategoryId) {
        await local.mergeCategories({
          budgetId: original.budgetId,
          sourceCategoryId: original.entityId,
          targetCategoryId: target.targetCategoryId,
          targetCategoryName: target.targetCategoryName ?? "",
          mutation: replay,
          resolveConflictId: conflictId,
        });
        return;
      }
    }
    await local.mutate(replay, conflictId);
  }

  async function listLocalFirstConflicts(
    budgetId: string,
  ): Promise<ReplicationConflict[]> {
    await synchronise(budgetId);
    const local = await requireDatabase(budgetId);
    const conflicts = await local.listSyncConflicts("unresolved", 100);
    return conflicts.map((conflict) => ({
      conflictId: conflict.conflictId,
      generationId: conflict.syncEpoch,
      key: conflict.entityKey,
      detectedAt: conflict.detectedAt,
      localOperationId: conflict.losingMutation.mutationId,
      localDeviceId: conflict.losingMutation.deviceId,
      localSequence: conflict.losingMutation.deviceSequence,
      localMutation: journalMutation(conflict.losingMutation),
      remoteOperationId: conflict.winningMutation.mutationId,
      remoteDeviceId: conflict.winningMutation.deviceId,
      remoteCursor: conflict.winningCursor,
      remoteMutation: journalMutation(conflict.winningMutation),
      deterministicWinner: "remote",
      status: conflict.status,
      resolvedAt: conflict.resolvedAt,
    }));
  }

  const client: AccountRegisterQueryClient & {
    publishLocalBaseline(budgetId: string): Promise<boolean>;
    listSyncConflicts(budgetId: string): Promise<ReplicationConflict[]>;
    resolveSyncConflict(
      budgetId: string,
      conflictId: string,
      resolution: "keep-local" | "accept-remote",
    ): Promise<void>;
  } = {
    async releaseLocalDatabase() {
      await opening?.catch(() => null);
      await synchronising?.promise.catch(() => undefined);
      await database?.close().catch(() => undefined);
      database = null;
      activeBudgetId = null;
      activeSyncEpoch = null;
      activePulledCursor = 0;
    },
    getBudgetExportUrl: lifecycle.getBudgetExportUrl,
    async exportBudget(budgetId) {
      await synchronise(budgetId);
      const local = await requireDatabase(budgetId);
      const { totalBytes } = await local.prepareBaselineExport();
      const chunks: BlobPart[] = [];
      try {
        for (let offset = 0; offset < totalBytes; offset += 4 * 1024 * 1024) {
          const chunk = await local.readBaselineExportChunk(
            offset,
            Math.min(4 * 1024 * 1024, totalBytes - offset),
          );
          chunks.push(Uint8Array.from(chunk).buffer);
        }
      } finally {
        await local.finishBaselineExport();
      }
      return new Blob(chunks, { type: "application/vnd.sqlite3" });
    },
    async restoreBudget(budgetId, file) {
      await synchronise(budgetId);
      const local = await requireDatabase(budgetId);
      await local.beginBaselineReplacement({
        budgetId,
        syncEpoch: activeSyncEpoch!,
        deviceId,
        totalBytes: file.size,
      });
      try {
        for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
          const chunk = new Uint8Array(
            await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer(),
          );
          await local.appendBaselineReplacement(offset, chunk);
        }
        const manifest = await local.commitBaselineReplacement();
        await publishLocalBaseline({
          budgetId,
          syncEpoch: activeSyncEpoch!,
          database: local,
          relay,
        });
        notifyLocalFirstMutationCommitted(budgetId);
        return {
          restored: true,
          counts: {
            ...manifest.counts,
            transactionTagAssignments: 0,
          },
        };
      } catch (error) {
        await local.abortBaselineReplacement().catch(() => undefined);
        throw error;
      }
    },
    async resetBudget(budgetId) {
      const local = await requireDatabase(budgetId);
      const epoch = await relay.resetEpoch(
        budgetId,
        LOCAL_BUDGET_SCHEMA_VERSION,
      );
      activeSyncEpoch = epoch.syncEpoch;
      activePulledCursor = 0;
      storage.setItem(`${SYNC_EPOCH_KEY_PREFIX}${budgetId}`, epoch.syncEpoch);
      await local.beginStagedImport({
        budgetId,
        syncEpoch: epoch.syncEpoch,
        deviceId,
      });
      await local.commitStagedImport(emptyDomainCounts());
      await publishLocalBaseline({
        budgetId,
        syncEpoch: epoch.syncEpoch,
        database: local,
        relay,
      });
      notifyLocalFirstMutationCommitted(budgetId);
    },
    async deleteBudget(budgetId) {
      const local = await readyDatabase(budgetId);
      await lifecycle.deleteBudget(budgetId);
      try {
        await local?.deleteBudgetFile();
      } catch (error) {
        throw Object.assign(
          error instanceof Error ? error : new Error("Local budget cleanup failed."),
          { authoritativeDeletionCompleted: true },
        );
      }
      database = null;
      activeBudgetId = null;
      activeSyncEpoch = null;
      activePulledCursor = 0;
    },
    async publishLocalBaseline(budgetId) {
      await synchronise(budgetId);
      const local = await requireDatabase(budgetId);
      await publishLocalBaseline({
        budgetId,
        syncEpoch: activeSyncEpoch!,
        database: local,
        relay,
      });
      return true;
    },
    listSyncConflicts: listLocalFirstConflicts,
    async resolveSyncConflict(budgetId, conflictId, resolution) {
      await synchronise(budgetId);
      const local = await requireDatabase(budgetId);
      const unresolvedConflicts =
        await local.listSyncConflicts("unresolved", 500);
      const conflict = unresolvedConflicts
        .find((value) => value.conflictId === conflictId);
      if (!conflict) {
        throw new Error("The synchronization conflict was not found.");
      }
      if (resolution === "keep-local") {
        const losingMutation = conflict.losingMutation;
        const transferPayload =
          losingMutation.domain === "transactions" &&
          !losingMutation.entityId.startsWith("attachment:")
            ? losingMutation.payload as {
                transferAccountId?: string | null;
                transferTransactionId?: string | null;
              } | null
            : null;

        const isLinkedTransfer =
          Boolean(transferPayload?.transferAccountId) ||
          Boolean(transferPayload?.transferTransactionId);

        if (isLinkedTransfer && losingMutation.operationGroupId) {
          await replayGroupedTransferConflicts(
            local,
            conflict,
            unresolvedConflicts,
          );
        } else {
          await replayConflictMutation(
            local,
            losingMutation,
            conflictId,
          );
        }

        await synchronise(budgetId);
      } else {
        await local.resolveSyncConflict(conflictId, resolution);
      }
    },
    async getBudgetStatus(budgetId) {
      const remote = await relay.getBootstrap(budgetId).catch(() => null);
      if (!remote?.baseline) {
        return {
          budgetId,
          generationId: null,
          state: "legacy",
          activatedAt: null,
          capabilities: {
            accountRegisters: false,
            budgetMonths: false,
            analytics: false,
            scheduledTransactions: false,
          },
        };
      }
      return {
        budgetId,
        generationId: remote.syncEpoch,
        state: "active",
        activatedAt: Date.parse(remote.baseline.committedAt),
        capabilities: {
          accountRegisters: true,
          budgetMonths: true,
          analytics: true,
          scheduledTransactions: true,
        },
      };
    },
    async getAccountRegisterBootstrap(input) {
      const local = await syncThenDatabase(input.budgetId);
      const needsFilteredCount =
        Boolean(input.search?.query.trim()) ||
        input.categoryFilter === "uncategorised";
      const [summary, page] = await Promise.all([
        local.getAccountSummary(input),
        local.queryTransactions({
          ...toLocalQuery(input),
          includeTotalCount: needsFilteredCount,
        }),
      ]);
      return { summary, page };
    },
    prefetchAccountRegister(input) {
      void client.getAccountRegisterBootstrap(input).catch(() => undefined);
    },
    async getAccountSummary(input) {
      return (await syncThenDatabase(input.budgetId)).getAccountSummary(input);
    },
    async queryTransactions(input) {
      return (await syncThenDatabase(input.budgetId)).queryTransactions({
        ...toLocalQuery(input),
        includeTotalCount: false,
      });
    },
    async getTransactionsByIds(input) {
      return (await syncThenDatabase(input.budgetId)).getTransactionsByIds(
        input.budgetId,
        input.accountId,
        input.ids,
      );
    },
    async getImportedTransactionSourceOccurrences(input) {
      return (
        await syncThenDatabase(input.budgetId)
      ).getImportedTransactionSourceOccurrences(
        input.budgetId,
        input.accountId,
        input.fileType,
      );
    },
    async captureTransactionHistorySnapshots(input) {
      return (await syncThenDatabase(input.budgetId)).captureTransactionHistorySnapshots(
        input.budgetId,
        input.transactionIds,
      );
    },
    async restoreTransactionHistorySnapshot(snapshot) {
      const local = await requireDatabase(snapshot.budgetId);
      const operationGroupId = createRuntimeUuid();
      const members: LocalBudgetOperationGroup["members"] = [
        ...snapshot.transactions.map((transaction) => ({
          domain: "transactions" as const,
          entityId: transaction.id,
          operation: "upsert" as const,
          payload: transaction,
        })),
        ...snapshot.attachments.map((attachment) => ({
          domain: "transactions" as const,
          entityId: `attachment:${attachment.id}`,
          operation: "upsert" as const,
          payload: {
            kind: "transaction-attachment-upsert" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
            contentBase64: encodeBase64(attachment.content),
          },
        })),
      ];
      const group: LocalBudgetOperationGroup = { members };
      await local.restoreTransactionHistorySnapshot(
        snapshot,
        members.map((member) => mutation(
          snapshot.budgetId, member.domain, member.entityId,
          member.operation, member.payload, operationGroupId, group,
        )),
      );
      notifyLocalFirstMutationCommitted(snapshot.budgetId);
    },
    async deleteTransactionHistorySnapshot(snapshot) {
      const local = await requireDatabase(snapshot.budgetId);
      const operationGroupId = createRuntimeUuid();
      const members: LocalBudgetOperationGroup["members"] = [
        ...snapshot.transactions.map((transaction) => ({
          domain: "transactions" as const,
          entityId: transaction.id,
          operation: "delete" as const,
          payload: {
            accountId: transaction.accountId,
            amount: transaction.amount,
            transferAccountId: transaction.transferAccountId,
            transferTransactionId: transaction.transferTransactionId,
          },
        })),
        ...snapshot.attachments.map((attachment) => ({
          domain: "transactions" as const,
          entityId: `attachment:${attachment.id}`,
          operation: "delete" as const,
          payload: {
            kind: "transaction-attachment-delete" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
          },
        })),
      ];
      const group: LocalBudgetOperationGroup = { members };
      await local.deleteTransactionHistorySnapshot(
        snapshot,
        members.map((member) => mutation(
          snapshot.budgetId, member.domain, member.entityId,
          member.operation, member.payload, operationGroupId, group,
        )),
      );
      notifyLocalFirstMutationCommitted(snapshot.budgetId);
    },
    async replaceTransactionHistorySnapshot({ expected, replacement }) {
      if (expected.budgetId !== replacement.budgetId) {
        throw new Error("Transaction history replacement cannot cross budgets.");
      }
      const local = await requireDatabase(expected.budgetId);
      const nextTransactionIds = new Set(replacement.transactions.map(({ id }) => id));
      const nextAttachmentIds = new Set(replacement.attachments.map(({ id }) => id));
      const members: LocalBudgetOperationGroup["members"] = [
        ...expected.transactions.filter(({ id }) => !nextTransactionIds.has(id)).map((transaction) => ({
          domain: "transactions" as const, entityId: transaction.id, operation: "delete" as const,
          payload: { accountId: transaction.accountId, amount: transaction.amount,
            transferAccountId: transaction.transferAccountId, transferTransactionId: transaction.transferTransactionId },
        })),
        ...expected.attachments.filter(({ id }) => !nextAttachmentIds.has(id)).map((attachment) => ({
          domain: "transactions" as const, entityId: `attachment:${attachment.id}`, operation: "delete" as const,
          payload: { kind: "transaction-attachment-delete" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment) },
        })),
        ...replacement.transactions.map((transaction) => ({
          domain: "transactions" as const, entityId: transaction.id, operation: "upsert" as const,
          payload: transaction,
        })),
        ...replacement.attachments.map((attachment) => ({
          domain: "transactions" as const, entityId: `attachment:${attachment.id}`, operation: "upsert" as const,
          payload: { kind: "transaction-attachment-upsert" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
            contentBase64: encodeBase64(attachment.content) },
        })),
      ];
      const operationGroupId = createRuntimeUuid();
      const group: LocalBudgetOperationGroup = { members };
      await local.replaceTransactionHistorySnapshot(
        expected,
        replacement,
        members.map((member) => mutation(
          expected.budgetId, member.domain, member.entityId,
          member.operation, member.payload, operationGroupId, group,
        )),
      );
      notifyLocalFirstMutationCommitted(expected.budgetId);
    },
    async addTransaction(input) {
      const local = await requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, input.id);
      if (existing) {
        throw new Error(
          `Transaction ${input.id} already exists and cannot be added again.`,
        );
      }

      const records = await buildNewTransactionRecords(local, input.id, input);
      await local.writeTransactionBatch(
        transactionWrites(records),
        {
          requireAbsentTransactionIds: records.map((record) => record.id),
        },
      );
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async commitTransactionBatch(input) {
      const local = await requireDatabase(input.budgetId);

      const {
        writes,
        requireAbsentTransactionIds,
      } = await prepareTransactionBatchWrites(local, input);

      await local.writeTransactionBatch(writes, {
        requireAbsentTransactionIds,
        verifyWrittenTransactions:
          input.provenanceAssignments.length > 0,
      });

      if (writes.length > 0) {
        notifyLocalFirstMutationCommitted(input.budgetId);
      }
    },

    async commitImportBatch(input) {
      const local = await requireDatabase(input.budgetId);

      const {
        writes,
        requireAbsentTransactionIds,
      } = await prepareTransactionBatchWrites(local, input);

      const payeeWrites = input.payeeCreations.map((creation) => {
        const now = new Date().toISOString();
        const name = creation.name.replace(/\s+/g, " ").trim();

        if (!creation.id.trim() || !name) {
          throw new Error(
            "A staged import payee requires both an ID and a name.",
          );
        }

        const payee: LocalPayeeRecord = {
          id: creation.id,
          budgetId: input.budgetId,
          name,
          note: "",
          archived: false,
          createdAt: now,
          updatedAt: now,
        };

        return {
          payee,
          mutation: mutation(
            input.budgetId,
            "payees",
            payee.id,
            "upsert",
            payee,
          ),
        };
      });

      await local.writeImportBatch(
        payeeWrites,
        writes,
        {
          requireAbsentTransactionIds,
          verifyWrittenTransactions: true,
        },
      );

      if (payeeWrites.length > 0 || writes.length > 0) {
        notifyLocalFirstMutationCommitted(input.budgetId);
      }
    },

    async moveTransactions(input) {
      const local = await requireDatabase(input.budgetId);
      const writes: {
        transaction: LocalTransactionRecord;
        mutation: LocalBudgetMutation;
      }[] = [];

      for (const transactionId of input.transactionIds) {
        const existing = await local.getTransaction(input.budgetId, transactionId);
        if (!existing || existing.accountId !== input.sourceAccountId) continue;

        requireMutableTransaction(existing);

        const counterpart = await requireTransferCounterpart(local, existing);
        if (counterpart) {
          requireMutableTransaction(counterpart);
        }

        if (
          counterpart &&
          input.targetAccountId === existing.transferAccountId
        ) {
          throw new Error(
            "This transfer cannot be moved to the account containing its other side.",
          );
        }

        const updatedAt = new Date().toISOString();
        const record: LocalTransactionRecord = {
          ...existing,
          accountId: input.targetAccountId,
          updatedAt,
        };

        if (!counterpart) {
          writes.push({
            transaction: record,
            mutation: mutation(
              input.budgetId,
              "transactions",
              transactionId,
              "upsert",
              record,
            ),
          });
          continue;
        }

        const counterpartRecord: LocalTransactionRecord = {
          ...counterpart,
          transferAccountId: input.targetAccountId,
          updatedAt,
        };
        const operationGroupId = createRuntimeUuid();
        const operationGroup: LocalBudgetOperationGroup = {
          members: [record, counterpartRecord].map((transaction) => ({
            domain: "transactions",
            entityId: transaction.id,
            operation: "upsert",
            payload: transaction,
          })),
        };

        writes.push(
          {
            transaction: record,
            mutation: mutation(
              input.budgetId,
              "transactions",
              record.id,
              "upsert",
              record,
              operationGroupId,
              operationGroup,
            ),
          },
          {
            transaction: counterpartRecord,
            mutation: mutation(
              input.budgetId,
              "transactions",
              counterpartRecord.id,
              "upsert",
              counterpartRecord,
              operationGroupId,
              operationGroup,
            ),
          },
        );
      }

      await local.writeTransactionBatch(
        transactionWritesAsSingleOperationGroup(
          writes.map(({ transaction }) => transaction),
        ),
      );
      if (writes.length > 0) notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async updateTransaction(transactionId, input) {
      const local = await requireDatabase(input.budgetId);
      const existing = await local.getTransaction(
        input.budgetId,
        transactionId,
      );

      if (!existing) {
        throw new Error("The local transaction was not found.");
      }

      const records = await buildUpdatedTransactionRecords(
        local,
        transactionId,
        input,
        existing,
      );

      await local.writeTransactionBatch(transactionWrites(records));
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async toggleTransactionCleared(transactionId, input) {
      const local = await requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, transactionId);
      if (!existing) throw new Error("The local transaction was not found.");

      requireMutableTransaction(existing);

      const record = {
        ...existing,
        clearedStatus: existing.clearedStatus === "uncleared" ? "cleared" : "uncleared",
        updatedAt: new Date().toISOString(),
      };
      await local.writeTransaction(
        record,
        mutation(input.budgetId, "transactions", transactionId, "upsert", record),
      );
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async setTransactionsCleared(input) {
      const local = await requireDatabase(input.budgetId);
      const records: LocalTransactionRecord[] = [];
      for (const transactionId of [...new Set(input.transactionIds)]) {
        const existing = await local.getTransaction(input.budgetId, transactionId);
        if (!existing) throw new Error(`Transaction ${transactionId} was not found.`);
        requireMutableTransaction(existing);
        records.push({
          ...existing,
          clearedStatus: input.cleared ? "cleared" : "uncleared",
          updatedAt: new Date().toISOString(),
        });
      }
      await local.writeTransactionBatch(transactionWritesAsSingleOperationGroup(records), {
        verifyWrittenTransactions: true,
      });
      if (records.length > 0) notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async deleteTransaction(transactionId, input) {
      const local = await requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, transactionId);

      if (!existing) {
        await local.deleteTransaction(
          transactionId,
          mutation(
            input.budgetId,
            "transactions",
            transactionId,
            "delete",
            null,
          ),
        );
        notifyLocalFirstMutationCommitted(input.budgetId);
        return;
      }

      requireMutableTransaction(existing);

      const counterpart =
        await findReciprocalTransferCounterpartForDelete(local, existing);
      if (counterpart) {
        requireMutableTransaction(counterpart);
      }

      if (!counterpart) {
        await local.deleteTransaction(
          transactionId,
          mutation(
            input.budgetId,
            "transactions",
            transactionId,
            "delete",
            {
              accountId: existing.accountId,
              amount: existing.amount,
              transferAccountId: existing.transferAccountId,
              transferTransactionId: existing.transferTransactionId,
            },
          ),
        );
        notifyLocalFirstMutationCommitted(input.budgetId);
        return;
      }

      const operationGroupId = createRuntimeUuid();
      const operationGroup: LocalBudgetOperationGroup = {
        members: [
          {
            domain: "transactions",
            entityId: existing.id,
            operation: "delete",
            payload: {
              accountId: existing.accountId,
              amount: existing.amount,
              transferAccountId: existing.transferAccountId,
              transferTransactionId: existing.transferTransactionId,
            },
          },
          {
            domain: "transactions",
            entityId: counterpart.id,
            operation: "delete",
            payload: {
              accountId: counterpart.accountId,
              amount: counterpart.amount,
              transferAccountId: counterpart.transferAccountId,
              transferTransactionId: counterpart.transferTransactionId,
            },
          },
        ],
      };

      await local.deleteTransactionBatch(
        operationGroup.members.map((member) => ({
          transactionId: member.entityId,
          mutation: mutation(
            input.budgetId,
            member.domain,
            member.entityId,
            member.operation,
            member.payload,
            operationGroupId,
            operationGroup,
          ),
        })),
      );

      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async addTransactionAttachment(input) {
      const local = await requireDatabase(input.budgetId);
      const attachment: LocalTransactionAttachmentRecord = {
        id: input.attachment.id,
        budgetId: input.budgetId,
        transactionId: input.transactionId,
        fileName: input.attachment.fileName,
        fileSize: input.attachment.fileSize,
        mimeType: input.attachment.mimeType,
        attachedAt: input.attachment.attachedAt,
        contentHash: input.attachment.contentHash ?? "",
      };
      const payload: LocalTransactionAttachmentMutationPayload = {
        kind: "transaction-attachment-upsert",
        attachment,
        contentBase64: encodeBase64(input.content),
      };
      await local.writeTransactionAttachment(
        attachment,
        input.content,
        mutation(
          input.budgetId,
          "transactions",
          `attachment:${attachment.id}`,
          "upsert",
          payload,
        ),
      );
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async removeTransactionAttachment(input) {
      const local = await requireDatabase(input.budgetId);
      const attachment: LocalTransactionAttachmentRecord = {
        id: input.attachmentId,
        budgetId: input.budgetId,
        transactionId: input.transactionId,
        fileName: "deleted",
        fileSize: 0,
        mimeType: "application/octet-stream",
        attachedAt: new Date().toISOString(),
        contentHash: `sha256:${"0".repeat(64)}`,
      };
      const payload: LocalTransactionAttachmentMutationPayload = {
        kind: "transaction-attachment-delete",
        attachment,
      };
      await local.deleteTransactionAttachment(
        input.attachmentId,
        mutation(
          input.budgetId,
          "transactions",
          `attachment:${input.attachmentId}`,
          "delete",
          payload,
        ),
      );
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async readTransactionAttachment(input) {
      const local = await requireDatabase(input.budgetId);
      const stored = await local.readTransactionAttachmentContent(
        input.budgetId,
        input.attachmentId,
      );
      return stored
        ? new Blob([stored.content.buffer as ArrayBuffer], { type: stored.mimeType })
        : null;
    },
    async listAccounts(budgetId) {
      return (await client.listAccountNavigation(budgetId)).map(({ account }) => account);
    },
    async listAccountNavigation(budgetId) {
      const local = await syncThenDatabase(budgetId);
      return (await local.listAccountNavigation(budgetId)).map((row) => ({
        account: {
          id: row.id,
          name: row.name,
          type: row.type as never,
          startingBalance: row.openingBalance / 100,
          isClosed: row.closedAt !== null,
          createdAt: row.closedAt ?? new Date(0).toISOString(),
          closedAt: row.closedAt ?? undefined,
        },
        currencyCode: row.currencyCode,
        workingBalance: row.workingBalance / 100,
        hasUncategorizedTransactions: Boolean(row.hasUncategorizedTransactions),
        transactionCount: row.transactionCount,
      }));
    },
    async createAccount(budgetId, input) {
      const navigation = await client.listAccountNavigation(budgetId);
      const currencyCode = navigation[0]?.currencyCode ?? "AUD";
      const now = new Date().toISOString();
      const account = {
        id: createRuntimeUuid(),
        budgetId,
        name: input.name,
        type: input.type,
        participation: input.type === "tracking" ? "off-budget" : "on-budget",
        openingBalance: Math.round(input.startingBalance * 100),
        currencyCode,
        createdAt: now,
        closedAt: null,
      };
      const local = await requireDatabase(budgetId);
      await local.writeAccount(
        account,
        mutation(budgetId, "accounts", account.id, "upsert", account),
      );
      notifyLocalFirstMutationCommitted(budgetId);
      return listLocalAccounts(budgetId);
    },
    async updateAccount(budgetId, input) {
      const local = await requireDatabase(budgetId);
      const current = (await local.listAccountNavigation(budgetId))
        .find(({ id }) => id === input.id);
      if (!current) throw new Error("The local account was not found.");
      const account = {
        id: current.id,
        budgetId,
        name: input.name,
        type: input.type,
        participation: input.type === "tracking" ? "off-budget" : "on-budget",
        openingBalance: current.openingBalance,
        currencyCode: current.currencyCode,
        createdAt: new Date(0).toISOString(),
        closedAt: current.closedAt,
      };
      await local.writeAccount(
        account,
        mutation(budgetId, "accounts", account.id, "upsert", account),
      );
      notifyLocalFirstMutationCommitted(budgetId);
      return listLocalAccounts(budgetId);
    },
    async setAccountClosed(input) {
      const local = await requireDatabase(input.budgetId);
      const current = (await local.listAccountNavigation(input.budgetId))
        .find(({ id }) => id === input.accountId);
      if (!current) throw new Error("The local account was not found.");
      const account = {
        id: current.id,
        budgetId: input.budgetId,
        name: current.name,
        type: current.type,
        participation: current.participation,
        openingBalance: current.openingBalance,
        currencyCode: current.currencyCode,
        createdAt: new Date(0).toISOString(),
        closedAt: input.closed ? new Date().toISOString() : null,
      };
      await local.writeAccount(
        account,
        mutation(input.budgetId, "accounts", account.id, "upsert", account),
      );
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async deleteAccount(budgetId, accountId) {
      const local = await requireDatabase(budgetId);
      try {
        await local.deleteAccount(
          budgetId,
          accountId,
          mutation(budgetId, "accounts", accountId, "delete", null),
        );
        notifyLocalFirstMutationCommitted(budgetId);
        return { deleted: true, accounts: [...await listLocalAccounts(budgetId)] };
      } catch (error) {
        if ((error as { code?: string }).code !== "ACCOUNT_NOT_EMPTY") throw error;
        return {
          deleted: false,
          reason: "This account contains transactions and cannot be deleted.",
          accounts: [...await client.listAccounts(budgetId)],
        };
      }
    },
    async getBudgetMonthView(input) {
      await synchronise(input.budgetId);
      const local = await requireDatabase(input.budgetId);
      const view = await local.readEntity<BudgetMonthView>(
        "budgetMonths",
        input.month,
      );
      if (!view) throw new Error(`Budget month ${input.month} is not available locally.`);
      if (storage.getItem(BUDGET_ENGINE_DIAGNOSTIC_STORAGE_KEY) === "true") {
        void local.getBudgetProjectionDiagnostic(input.budgetId, input.month).then(
          (diagnostic) => {
            if (!diagnostic.matchesSnapshot) {
              console.warn("Budget engine diagnostic differs from the legacy snapshot.", diagnostic);
            }
          },
          (error) => console.warn("Budget engine diagnostic could not run.", error),
        );
      }
      return view;
    },
    prefetchBudgetMonthView(input) {
      void client.getBudgetMonthView(input).catch(() => undefined);
    },
    async setCategoryAssignedValues(input) {
      const local = await requireDatabase(input.budgetId);
      await local.mutateBatch(input.assignments.map(({ categoryId, assigned }) =>
        mutation(
          input.budgetId,
          "budgetMonths",
          `assignment:${input.month}:${categoryId}`,
          "upsert",
          {
            kind: "category-assignment",
            month: input.month,
            categoryId,
            assigned,
          },
        )));
      notifyLocalFirstMutationCommitted(input.budgetId);
      const next = await local.readEntity<BudgetMonthView>(
        "budgetMonths",
        input.month,
      );
      if (!next) {
        throw new Error(`Budget month ${input.month} is not available locally.`);
      }
      return next;
    },
    async getBudgetCategoryOptions(input) {
      const view = await client.getBudgetMonthView(input);
      return [{
        id: "__ready_to_assign__", name: "Ready to Assign",
        groupId: "__income__", groupName: "Income",
      }, ...view.categoryGroups.flatMap((group) => group.categories.map((category) => ({
        id: category.id,
        name: category.name,
        groupId: group.id,
        groupName: group.name,
        isArchived: category.isArchived,
      })))];
    },
    async getFinancialOverview(budgetId, month) {
      return (await syncThenDatabase(budgetId)).getFinancialOverview(budgetId, month);
    },
    async getMonthlySpending(budgetId, month) {
      return (await syncThenDatabase(budgetId)).getMonthlySpending(budgetId, month);
    },
    async getMonthlyCategoryTransactions(budgetId, month, categoryId) {
      return (await syncThenDatabase(budgetId))
        .getMonthlyCategoryTransactions(budgetId, month, categoryId);
    },
    async getCategoryActivityDrilldown(input) {
      return (await syncThenDatabase(input.budgetId)).getCategoryActivityDrilldown(
        input.budgetId,
        input.month,
        input.categoryId,
      );
    },
    async mutateCategory(budgetId, input) {
      const view = await client.getBudgetMonthView({
        budgetId,
        month: input.month,
      });
      const next = mutateBudgetCategory(view, input);
      if (input.operation === "overspending") {
        const local = await requireDatabase(budgetId);
        const categoryId = String(input.categoryId);
        const policy = input.overspendingHandling as
          | "reduce-next-month"
          | "carry-category";
        await local.mutateBatch([mutation(
          budgetId,
          "budgetMonths",
          `policy:${input.month}:${categoryId}`,
          "upsert",
          {
            kind: "category-overspending-policy",
            startMonth: input.month,
            categoryId,
            policy,
          },
        )]);
        notifyLocalFirstMutationCommitted(budgetId);
        return client.getBudgetMonthView({ budgetId, month: input.month });
      }
      if (input.operation === "merge") {
        const targetCategoryId = String(input.targetCategoryId);
        const target = view.categoryGroups.flatMap(({ categories }) => categories)
          .find(({ id }) => id === targetCategoryId);
        if (!target) throw new Error("The target local category was not found.");
        const local = await requireDatabase(budgetId);
        const sourceCategoryId = String(input.categoryId);
        const payload = {
          targetCategoryId,
          targetCategoryName: target.name,
        };
        await local.mergeCategories({
          budgetId,
          sourceCategoryId,
          targetCategoryId,
          targetCategoryName: target.name,
          mutation: mutation(
            budgetId, "categories", sourceCategoryId, "delete", payload,
          ),
        });
      }
      await writeEntity(budgetId, "budgetMonths", input.month, next);
      return client.getBudgetMonthView({ budgetId, month: input.month });
    },
    async getCategoryMergePreview(input) {
      const view = await client.getBudgetMonthView(input);
      const located = view.categoryGroups.flatMap((group) =>
        group.categories.map((category) => ({ category, group })));
      const source = located.find(({ category }) => category.id === input.sourceCategoryId);
      const target = located.find(({ category }) => category.id === input.targetCategoryId);
      if (!source || !target) throw new Error("The local category merge selection is invalid.");
      return {
        sourceCategoryId: source.category.id,
        sourceCategoryName: source.category.name,
        sourceGroupName: source.group.name,
        sourcePreviousAvailable: source.category.previousAvailable,
        sourceAssigned: source.category.assigned,
        sourceActivity: source.category.activity,
        sourceAvailable: source.category.available,
        sourceIsArchived: source.category.isArchived,
        targetCategoryId: target.category.id,
        targetCategoryName: target.category.name,
        targetGroupName: target.group.name,
        targetPreviousAvailable: target.category.previousAvailable,
        targetAssigned: target.category.assigned,
        targetActivity: target.category.activity,
        targetAvailable: target.category.available,
        targetIsArchived: target.category.isArchived,
        combinedPreviousAvailable: source.category.previousAvailable + target.category.previousAvailable,
        combinedAssigned: source.category.assigned + target.category.assigned,
        combinedActivity: source.category.activity + target.category.activity,
        combinedAvailable: source.category.available + target.category.available,
        registerTransactionCount: 0,
        registerSplitLineCount: 0,
        scheduledTransactionCount: 0,
      };
    },
    async listPayees(budgetId, archived = false) {
      const rows = await (await syncThenDatabase(budgetId)).listPayees(budgetId, archived);
      return rows.map(localPayeeRecordToView);
    },
    async listPayeeDuplicateSuppressions(budgetId) {
      return (await syncThenDatabase(budgetId)).listPayeeDuplicateSuppressions(budgetId);
    },
    async keepPayeesSeparate(budgetId, pairs) {
      await (await requireDatabase(budgetId)).keepPayeesSeparate(budgetId, pairs);
    },
    async createPayee(budgetId, name) {
      const now = new Date().toISOString();
      const payee = {
        id: createRuntimeUuid(), budgetId, name: name.trim(),
        note: "", archived: false,
      };
      const local = await requireDatabase(budgetId);
      await local.writePayee(payee, mutation(budgetId, "payees", payee.id, "upsert", payee));
      notifyLocalFirstMutationCommitted(budgetId);
      return listPersistedPayees(budgetId, false);
    },
    async updatePayee(budgetId, input) {
      const local = await requireDatabase(budgetId);
      const all = [...await local.listPayees(budgetId, false), ...await local.listPayees(budgetId, true)];
      const current = all.find((row) => row.id === input.id);
      if (!current) throw new Error("The local payee was not found.");
      const payee = {
        id: current.id, budgetId,
        name: input.name ?? current.name,
        note: input.note ?? current.note,
        archived: current.archived,
        defaultCategoryId: input.defaultCategoryId ?? current.defaultCategoryId,
        defaultCategoryName: input.defaultCategoryName ?? current.defaultCategoryName,
        aliases: input.aliases ?? current.aliases,
        importRules: input.importRules ?? current.importRules,
        iconRef: input.iconUpdate
          ? input.iconUpdate.kind === "automatic"
            ? ""
            : validatePayeeIconReferenceForWrite(input.iconUpdate.iconRef)
          : current.iconRef,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await local.writePayee(payee, mutation(budgetId, "payees", payee.id, "upsert", payee));
      notifyLocalFirstMutationCommitted(budgetId);
      return listPersistedPayees(budgetId, false);
    },
    async setPayeeArchived(budgetId, payeeId, archived) {
      const local = await requireDatabase(budgetId);
      const all = [...await local.listPayees(budgetId, false), ...await local.listPayees(budgetId, true)];
      const current = all.find((row) => row.id === payeeId);
      if (!current) throw new Error("The local payee was not found.");
      const payee = { ...current, budgetId, archived };
      await local.writePayee(payee, mutation(budgetId, "payees", payee.id, "upsert", payee));
      notifyLocalFirstMutationCommitted(budgetId);
      return listPersistedPayees(budgetId, archived);
    },
    async deleteUnusedPayee(budgetId, payeeId) {
      const local = await requireDatabase(budgetId);
      await local.deleteUnusedPayee(
        budgetId,
        payeeId,
        mutation(budgetId, "payees", payeeId, "delete", { kind: "unused-payee-delete" }),
      );
      notifyLocalFirstMutationCommitted(budgetId);
      return listPersistedPayees(budgetId, false);
    },
    async mergePayees(budgetId, input) {
      const local = await requireDatabase(budgetId);
      const target = [
        ...await local.listPayees(budgetId, false),
        ...await local.listPayees(budgetId, true),
      ].find(({ id }) => id === input.targetPayeeId);
      if (!target) throw new Error("The target local payee was not found.");
      const payload = {
        targetPayeeId: target.id,
        targetPayeeName: target.name,
      };
      await local.mergePayees({
        budgetId,
        sourcePayeeId: input.sourcePayeeId,
        sourcePayeeIds: input.sourcePayeeIds,
        targetPayeeId: target.id,
        targetPayeeName: target.name,
        updateLinkedTransactions: input.updateLinkedTransactions,
        updateScheduledTransactions: input.updateScheduledTransactions,
        addMergedAliases: input.addMergedAliases,
        redirectRecognitionRules: input.redirectRecognitionRules,
        mutation: mutation(
          budgetId, "payees", input.sourcePayeeId, "delete", {
            ...payload,
            sourcePayeeIds: input.sourcePayeeIds,
            updateLinkedTransactions: input.updateLinkedTransactions,
            updateScheduledTransactions: input.updateScheduledTransactions,
            addMergedAliases: input.addMergedAliases,
            redirectRecognitionRules: input.redirectRecognitionRules,
          },
        ),
      });
      notifyLocalFirstMutationCommitted(budgetId);
      return listPersistedPayees(budgetId, false);
    },
    async listTransactionTags(budgetId) {
      await synchronise(budgetId);
      return (await requireDatabase(budgetId)).listEntities<TransactionTagDefinition>("transactionTags");
    },
    async replaceTransactionTags(budgetId, tags) {
      const existing = await client.listTransactionTags(budgetId);
      const nextIds = new Set(tags.map(({ id }) => id));
      for (const tag of existing) {
        if (!nextIds.has(tag.id)) await writeEntity(budgetId, "transactionTags", tag.id, null, "delete");
      }
      for (const tag of tags) await writeEntity(budgetId, "transactionTags", tag.id, tag);
      return tags;
    },
    listScheduledTransactions(budgetId, accountId) {
      return listSchedules(budgetId, accountId);
    },
    captureScheduledTransaction(budgetId, scheduleId) {
      return captureSchedule(budgetId, scheduleId);
    },
    async replaceScheduledTransactionHistoryState(input) {
      const local = await requireDatabase(input.budgetId);
      const members = scheduledHistoryMembers(input);
      const operationGroupId = createRuntimeUuid();
      const group: LocalBudgetOperationGroup = { members };
      await local.replaceScheduledTransactionHistoryState({
        scheduleId: input.scheduleId,
        expectedSchedule: input.expectedSchedule,
        replacementSchedule: input.replacementSchedule,
        expectedTransaction: input.expectedTransaction,
        replacementTransaction: input.replacementTransaction,
        mutations: members.map((member) => mutation(
          input.budgetId,
          member.domain,
          member.entityId,
          member.operation,
          member.payload,
          operationGroupId,
          group,
        )),
      });
      notifyLocalFirstMutationCommitted(input.budgetId);
    },
    async enterScheduledTransaction(input) {
      const local = await requireDatabase(input.budgetId);
      const current = await captureSchedule(input.budgetId, input.schedule.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(input.schedule)) {
        throw new Error("The scheduled transaction no longer matches its expected state.");
      }
      const advanced = advanceScheduledTransaction(current);
      const afterSchedule = advanced.action === "delete" ? null : advanced.transaction;
      let transaction: TransactionHistorySnapshot | null = null;
      if (input.createTransaction) {
        const records = await buildNewTransactionRecords(
          local,
          input.transactionId,
          scheduledRegisterWrite(input.budgetId, input.accountId, current),
        );
        const attachedAt = new Date().toISOString();
        transaction = {
          budgetId: input.budgetId,
          transactions: records,
          attachments: (current.attachments ?? []).map((attachment) => ({
            id: `${input.transactionId}:attachment:${attachment.id}`,
            budgetId: input.budgetId,
            transactionId: input.transactionId,
            fileName: attachment.fileName,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
            attachedAt,
            contentHash: attachment.contentHash,
            content: decodeBase64(attachment.contentBase64),
          })),
        };
      }
      await client.replaceScheduledTransactionHistoryState({
        budgetId: input.budgetId,
        scheduleId: current.id,
        expectedSchedule: current,
        replacementSchedule: afterSchedule,
        expectedTransaction: null,
        replacementTransaction: transaction,
      });
      return { afterSchedule, transaction };
    },
    async createScheduledTransaction(budgetId, input) {
      const schedule = buildScheduledTransaction(input);
      await writeEntity(budgetId, "scheduledTransactions", schedule.id, schedule);
      return listSchedules(budgetId, input.accountId, false);
    },
    async updateScheduledTransaction(budgetId, scheduleId, input) {
      const existing = (await listSchedules(budgetId, input.accountId))
        .find(({ id }) => id === scheduleId);
      if (!existing) throw new Error("The local scheduled transaction was not found.");
      const schedule = buildScheduledTransaction(
        input,
        { existing },
      );
      await writeEntity(budgetId, "scheduledTransactions", schedule.id, schedule);
      return listSchedules(budgetId, input.accountId, false);
    },
    async deleteScheduledTransaction(budgetId, accountId, scheduleId) {
      await writeEntity(budgetId, "scheduledTransactions", scheduleId, null, "delete");
      return listSchedules(budgetId, accountId, false);
    },
    async advanceScheduledTransaction(budgetId, accountId, scheduleId) {
      const existing = (
        await listSchedules(
          budgetId,
          accountId,
        )
      ).find(({ id }) => id === scheduleId);

      if (!existing) {
        return listSchedules(
          budgetId,
          accountId,
        );
      }

      const result =
        advanceScheduledTransaction(
          existing,
        );

      if (result.action === "delete") {
        await writeEntity(
          budgetId,
          "scheduledTransactions",
          scheduleId,
          null,
          "delete",
        );
      } else {
        await writeEntity(
          budgetId,
          "scheduledTransactions",
          scheduleId,
          result.transaction,
        );
      }

      return listSchedules(
        budgetId,
        accountId,
        false,
      );
    },

    async renameScheduledPayeeReferences(budgetId, input) {
      const schedules = await (await syncThenDatabase(budgetId))
        .listEntities<ScheduledTransactionView>("scheduledTransactions");
      for (const schedule of schedules) {
        if (
          schedule.payeeId === input.payeeId ||
          schedule.payee === input.previousName
        ) {
          await writeEntity(budgetId, "scheduledTransactions", schedule.id, {
            ...schedule,
            payee: input.nextName,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    async reassignScheduledPayeeReferences(budgetId, input) {
      const schedules = await (await syncThenDatabase(budgetId))
        .listEntities<ScheduledTransactionView>("scheduledTransactions");
      for (const schedule of schedules) {
        if (
          schedule.payeeId === input.sourcePayeeId ||
          schedule.payee === input.sourceName
        ) {
          await writeEntity(budgetId, "scheduledTransactions", schedule.id, {
            ...schedule,
            payeeId: input.targetPayeeId,
            payee: input.targetName,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
  };
  registerLocalSqliteAttachmentReader((budgetId, attachmentId) =>
    client.readTransactionAttachment({ budgetId, attachmentId }));
  return client;
}

function toLocalQuery(input: AccountTransactionQuery) {
  return {
    budgetId: input.budgetId,
    accountId: input.accountId,
    limit: input.limit,
    offset: input.offset,
    before: input.before,
    search: input.search,
    categoryFilter: input.categoryFilter,
    sort: input.sort,
  };
}

function readOrCreateDeviceId(storage: Pick<Storage, "getItem" | "setItem">): string {
  const existing = storage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = createRuntimeUuid();
  storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function mutateBudgetCategory(
  view: BudgetMonthView,
  input: { readonly operation: string; readonly [key: string]: unknown },
): BudgetMonthView {
  let groups = view.categoryGroups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
  const categoryId = String(input.categoryId ?? "");
  const groupId = String(input.groupId ?? "");
  if (input.operation === "create") {
    let group = groups.find(({ id }) => id === groupId);
    if (!group) {
      group = {
        id: groupId || createRuntimeUuid(),
        name: String(input.groupName ?? "New group"),
        previousAvailable: 0, assigned: 0, activity: 0, available: 0,
        note: "", categories: [],
      };
      groups = [...groups, group];
    }
    group.categories.push({
      id: createRuntimeUuid(),
      name: String(input.name ?? "New category"),
      previousAvailable: 0, assigned: 0, activity: 0, available: 0,
      isOverspent: false, isArchived: false, note: "",
    });
  }
  if (["rename", "archive", "overspending", "category-note"].includes(input.operation)) {
    groups = groups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => category.id !== categoryId
        ? category
        : {
            ...category,
            ...(input.operation === "rename" ? { name: String(input.name) } : {}),
            ...(input.operation === "archive" ? { isArchived: Boolean(input.isArchived) } : {}),
            ...(input.operation === "overspending"
              ? { overspendingHandling: input.overspendingHandling as "reduce-next-month" | "carry-category" }
              : {}),
            ...(input.operation === "category-note" ? { note: String(input.note ?? "") } : {}),
          }),
    }));
  }
  if (input.operation === "group-note") {
    groups = groups.map((group) => group.id === groupId
      ? { ...group, note: String(input.note ?? "") }
      : group);
  }
  if (input.operation === "move-category") {
    groups = groups.map((group) => ({
      ...group,
      categories: moveByDirection(group.categories, categoryId, String(input.direction)),
    }));
  }
  if (input.operation === "move-group") {
    groups = moveByDirection(groups, groupId, String(input.direction));
  }
  if (input.operation === "position-category") {
    groups = moveBudgetCategoryToTarget(
      groups,
      categoryId,
      String(input.targetCategoryId),
      String(input.placement),
    );
  }
  if (input.operation === "position-group") {
    groups = moveToTarget(
      groups, groupId, String(input.targetGroupId), String(input.placement),
    );
  }
  if (input.operation === "merge") {
    const targetId = String(input.targetCategoryId);
    const source = groups.flatMap(({ categories }) => categories)
      .find(({ id }) => id === categoryId);
    if (source) {
      groups = groups.map((group) => ({
        ...group,
        categories: group.categories
          .filter(({ id }) => id !== categoryId)
          .map((category) => category.id === targetId ? {
            ...category,
            previousAvailable: category.previousAvailable + source.previousAvailable,
            assigned: category.assigned + source.assigned,
            activity: category.activity + source.activity,
            available: category.available + source.available,
          } : category),
      }));
    }
  }
  return { ...view, categoryGroups: groups };
}

export function moveBudgetCategoryToTarget<
  TGroup extends {
    readonly id: string;
    readonly categories: readonly TCategory[];
  },
  TCategory extends { readonly id: string },
>(
  groups: readonly TGroup[],
  categoryId: string,
  targetCategoryId: string,
  placement: string,
): TGroup[] {
  if (categoryId === targetCategoryId) {
    return groups.map((group) => ({
      ...group,
      categories: [...group.categories],
    }));
  }

  let categoryToMove: TCategory | undefined;

  const withoutSource = groups.map((group) => {
    const source = group.categories.find(
      (category) => category.id === categoryId,
    );

    if (!source) {
      return {
        ...group,
        categories: [...group.categories],
      };
    }

    categoryToMove = source;

    return {
      ...group,
      categories: group.categories.filter(
        (category) => category.id !== categoryId,
      ),
    };
  });

  if (!categoryToMove) {
    return withoutSource;
  }

  let inserted = false;

  const moved = withoutSource.map((group) => {
    const targetIndex = group.categories.findIndex(
      (category) => category.id === targetCategoryId,
    );

    if (targetIndex < 0) {
      return group;
    }

    const categories = [...group.categories];
    categories.splice(
      targetIndex + (placement === "after" ? 1 : 0),
      0,
      categoryToMove!,
    );
    inserted = true;

    return {
      ...group,
      categories,
    };
  });

  if (inserted) {
    return moved;
  }

  // Invalid target: preserve the original grouping/order instead of dropping
  // the source category.
  return groups.map((group) => ({
    ...group,
    categories: [...group.categories],
  }));
}

function moveByDirection<T extends { readonly id: string }>(
  values: readonly T[], id: string, direction: string,
): T[] {
  const next = [...values];
  const index = next.findIndex((value) => value.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && target >= 0 && target < next.length) {
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function moveToTarget<T extends { readonly id: string }>(
  values: readonly T[], id: string, targetId: string, placement: string,
): T[] {
  const item = values.find((value) => value.id === id);
  if (!item || id === targetId) return [...values];
  const next = values.filter((value) => value.id !== id);
  const target = next.findIndex((value) => value.id === targetId);
  if (target < 0) return [...values];
  next.splice(target + (placement === "after" ? 1 : 0), 0, item);
  return next;
}
