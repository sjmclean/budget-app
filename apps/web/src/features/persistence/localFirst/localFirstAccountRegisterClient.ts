import type {
  LocalBudgetConflictRecoveryClient,
  LocalBudgetRuntimeClient,
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
import {
  LocalBudgetDatabaseClient,
  hasPublishedLocalBudgetDatabase,
} from "./localBudgetClient";
import type {
  LocalTransactionAttachmentMutationPayload,
  LocalTransactionRecord,
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
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";
import type { ReplicationConflict } from "../conflictResolution";
import {
  createLocalFirstTabSyncCoordinator,
  type LocalFirstTabSyncCoordinator,
} from "./tabSyncCoordinator";
import { notifyRemoteMutationsApplied, persistenceScopeForMutations } from "./mutationEvents";
import { publishBroadBudgetChange } from "../persistenceChangeBus";
import { registerLocalSqliteAttachmentReader } from "../../attachments/localSqliteAttachmentReader";
import { localPayeeRecordToView } from "./localPayeeView";
import { createBudgetDatabaseOwnership } from "./budgetDatabaseOwnership";
import { resolveOwnedBudgetId } from "./budgetDatabaseOwnershipRouting";
import { createRestorePointStore } from "../../budget/restorePointStore";
import { restorePointCoordinator } from "../../budget/restorePointCoordinator";
import type { RestorePointReason } from "../../budget/restorePointTypes";
import {
  createRestorePointReplacement,
  hasPendingRestoreJournal,
} from "./restorePointReplacement";
import { deriveTransactionChangeScope, mergePersistenceChangeScopes } from "./persistenceChangeImpact";
import { LocalBudgetMutationContext } from "./engine/mutationContext";
import { LocalBudgetCommandExecutor } from "./engine/localBudgetCommandExecutor";
import { committedCommandResult, type CommittedCommandHandlerResult } from "./engine/commandContext";
import {
  createOrdinaryCommandHandlerRegistry,
  createPublicOrdinaryCommandFacade,
  isOrdinaryCommandMethod,
} from "./engine/ordinaryCommandRegistry";
import { createTagCommands } from "./engine/tagCommands";
import { createAttachmentCommands } from "./engine/attachmentCommands";
import { createTransactionCommands } from "./engine/transactionCommands";
import { createAccountCommands } from "./engine/accountCommands";
import { createBudgetCategoryCommands } from "./engine/budgetCategoryCommands";
import { createCategoryGoalCommands } from "./engine/categoryGoalCommands";
import { createPayeeCommands } from "./engine/payeeCommands";
import { createScheduledTransactionCommands } from "./engine/scheduledTransactionCommands";
import { createTransactionHistoryCommands } from "./engine/transactionHistoryCommands";
import {
  buildNewTransactionRecords,
} from "./engine/transactionCommandHelpers";
import type { TransactionTagDefinition } from "../../tags/transactionTagTypes";

const DEVICE_ID_KEY = "budget-app.local-first.device-id";
const SYNC_EPOCH_KEY_PREFIX = "budget-app.local-first.sync-epoch.";
export const BUDGET_ENGINE_DIAGNOSTIC_STORAGE_KEY =
  "budget-app.local-first.budget-engine-diagnostics";

export interface LocalFirstRegisterRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly databaseFactory?: () => LocalBudgetDatabaseClient;
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
  readonly tabSyncCoordinator?: LocalFirstTabSyncCoordinator;
  readonly restorePointStore?: Pick<ReturnType<typeof createRestorePointStore>, "list" | "deleteBudget">;
  readonly restorePointBudgetName?: (budgetId: string) => string | undefined;
}

const OUTBOX_PUSH_TARGET_BYTES = 32 * 1024 * 1024;
type LocalOutboxRow = Awaited<ReturnType<LocalBudgetDatabaseClient["readOutbox"]>>[number];

function relayMutationFromOutboxRow(row: LocalOutboxRow, budgetId: string, syncEpoch: string): LocalBudgetMutation {
  return {
    mutationId: row.mutationId,
    operationGroupId: row.operationGroupId ?? undefined,
    operationGroup: row.operationGroupJson ? JSON.parse(row.operationGroupJson) : undefined,
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
  };
}

export function selectOutboxPushBatch(pending: readonly LocalOutboxRow[], budgetId: string, syncEpoch: string) {
  const utf8Encoder = new TextEncoder();
  const rows: LocalOutboxRow[] = [];
  const mutations: LocalBudgetMutation[] = [];
  let encodedBytes = utf8Encoder.encode(JSON.stringify({ budgetId, syncEpoch, mutations: [] })).byteLength;
  for (const row of pending) {
    const mutation = relayMutationFromOutboxRow(row, budgetId, syncEpoch);
    const mutationBytes = utf8Encoder.encode(JSON.stringify(mutation)).byteLength + 1;
    if (rows.length > 0 && encodedBytes + mutationBytes > OUTBOX_PUSH_TARGET_BYTES) break;
    rows.push(row);
    mutations.push(mutation);
    encodedBytes += mutationBytes;
  }
  return { rows, mutations, encodedBytes };
}

type LocalFirstRelayClient = ReturnType<typeof createLocalFirstRelayTransport>;

export interface LocalFirstConvergenceDatabase {
  readOutbox(
    afterSequence: number,
    limit: number,
  ): ReturnType<LocalBudgetDatabaseClient["readOutbox"]>;
  acknowledgeOutbox(throughSequence: number): Promise<unknown>;
  applyRemoteMutations(
    mutations: Parameters<LocalBudgetDatabaseClient["applyRemoteMutations"]>[0],
    throughCursor: number,
  ): Promise<unknown>;
}

export interface LocalFirstConvergenceRelay {
  pushMutations(
    input: Parameters<LocalFirstRelayClient["pushMutations"]>[0],
  ): Promise<unknown>;
  pullMutations(
    input: Parameters<LocalFirstRelayClient["pullMutations"]>[0],
  ): ReturnType<LocalFirstRelayClient["pullMutations"]>;
}

export async function pushLocalFirstOutbox(input: {
  readonly local: LocalFirstConvergenceDatabase;
  readonly relay: LocalFirstConvergenceRelay;
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly batchSize?: number;
}): Promise<number> {
  const batchSize = input.batchSize ?? 500;
  let pushedMutationCount = 0;
  while (true) {
    const pending = await input.local.readOutbox(0, batchSize);
    const outbox = selectOutboxPushBatch(
      pending,
      input.budgetId,
      input.syncEpoch,
    );
    if (outbox.rows.length === 0) break;
    await input.relay.pushMutations({
      budgetId: input.budgetId,
      syncEpoch: input.syncEpoch,
      mutations: outbox.mutations,
    });
    await input.local.acknowledgeOutbox(outbox.rows.at(-1)!.sequence);
    pushedMutationCount += outbox.mutations.length;
  }
  return pushedMutationCount;
}

export async function convergeLocalFirstMutations(input: {
  readonly local: LocalFirstConvergenceDatabase;
  readonly relay: LocalFirstConvergenceRelay;
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly pulledCursor: number;
  readonly batchSize?: number;
  readonly onRemoteMutationsApplied?: (
    mutations: readonly LocalBudgetMutation[],
  ) => void;
}): Promise<{
  readonly pushedMutationCount: number;
  readonly pulledMutationCount: number;
  readonly pulledCursor: number;
}> {
  const batchSize = input.batchSize ?? 500;
  const pushedMutationCount = await pushLocalFirstOutbox({
    local: input.local,
    relay: input.relay,
    budgetId: input.budgetId,
    syncEpoch: input.syncEpoch,
    batchSize,
  });

  let pulledCursor = input.pulledCursor;
  let pulledMutationCount = 0;
  while (true) {
    const pulled = await input.relay.pullMutations({
      budgetId: input.budgetId,
      syncEpoch: input.syncEpoch,
      afterCursor: pulledCursor,
      limit: batchSize,
    });
    if (pulled.mutations.length === 0 && pulled.hasMore) {
      throw new Error("The relay reported additional mutations without advancing the cursor.");
    }
    if (pulled.mutations.length > 0) {
      const throughCursor = pulled.mutations.at(-1)!.cursor;
      const mutations = pulled.mutations.map(({
        cursor,
        mutation,
        conflict,
      }) => ({
        cursor,
        mutation,
        ...(conflict ? { conflict } : {}),
      }));
      await input.local.applyRemoteMutations(mutations, throughCursor);
      input.onRemoteMutationsApplied?.(
        pulled.mutations.map(({ mutation }) => mutation),
      );
      pulledCursor = throughCursor;
      pulledMutationCount += pulled.mutations.length;
    }
    if (!pulled.hasMore) break;
  }

  return {
    pushedMutationCount,
    pulledMutationCount,
    pulledCursor,
  };
}

/**
 * Complete browser-local budget engine. All domain reads and writes use the
 * OPFS SQLite worker. Only explicit catalogue/backup lifecycle operations are
 * delegated to the narrow control-plane client.
 */
export function createLocalBudgetRuntime(
  lifecycle: BudgetLifecycleControlPlaneClient,
  options: LocalFirstRegisterRuntimeOptions = {},
): LocalBudgetRuntimeClient & LocalBudgetConflictRecoveryClient {
  const relay = createLocalFirstRelayTransport({ apiBaseUrl: options.apiBaseUrl });
  const storage = options.storage ?? globalThis.localStorage;
  const deviceId = readOrCreateDeviceId(storage);
  const restorePoints = options.restorePointStore ?? createRestorePointStore();
  const tabSyncCoordinator =
    options.tabSyncCoordinator ?? createLocalFirstTabSyncCoordinator();
  let database: LocalBudgetDatabaseClient | null = null;
  let activeBudgetId: string | null = null;
  let activeSyncEpoch: string | null = null;
  let activePulledCursor = 0;
  let opening: Promise<LocalBudgetDatabaseClient | null> | null = null;
  const mutationContext = new LocalBudgetMutationContext({
    storage,
    deviceId,
    currentSyncEpoch: () => activeSyncEpoch,
    currentBaseCursor: () => activePulledCursor,
  });
  const commandExecutor = new LocalBudgetCommandExecutor();
  let synchronising: {
    readonly budgetId: string;
    readonly promise: Promise<import("../accountRegisterQueryContracts").LocalBudgetSynchronisationResult>;
  } | null = null;

  async function captureOwnedRestorePoint(budgetId: string, reason: RestorePointReason) {
    const local = database;
    if (!local || activeBudgetId !== budgetId) {
      if (reason === "timed" || reason === "before-switch" || reason === "before-import") return null;
      throw new Error("Open the budget before creating its safety restore point.");
    }
    const mutationCount = restorePointCoordinator.count(budgetId);
    const capturedVersion = restorePointCoordinator.version(budgetId);
    if (reason === "timed" && mutationCount === 0) return null;
    if (reason === "before-switch" || reason === "timed") {
      const manifest = await local.getManifest();
      const latest = (await restorePoints.list(budgetId))[0];
      if (latest?.syncEpoch === manifest.syncEpoch && latest.localRevision === manifest.localRevision) {
        restorePointCoordinator.checkpoint(budgetId, capturedVersion);
        return null;
      }
    }
    const point = await local.captureRestorePoint({
      budgetName: options.restorePointBudgetName?.(budgetId) ?? budgetId,
      reason, mutationCount,
    });
    restorePointCoordinator.checkpoint(budgetId, capturedVersion);
    return point;
  }

  async function drainLocalOutbox(
    local: LocalBudgetDatabaseClient,
    budgetId: string,
    syncEpoch: string,
  ): Promise<void> {
    await pushLocalFirstOutbox({
      local,
      relay,
      budgetId,
      syncEpoch,
    });
  }

  async function readyDatabase(budgetId: string): Promise<LocalBudgetDatabaseClient | null> {
    if (database && activeBudgetId === budgetId) return database;
    if (opening) return opening;
    opening = (async () => {
      if (database && activeBudgetId) {
        await captureOwnedRestorePoint(activeBudgetId, "before-switch");
      }
      await database?.close();
      database = null;
      activeBudgetId = null;
      activeSyncEpoch = null;
      activePulledCursor = 0;

      let cachedSyncEpoch = storage.getItem(
        `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
      );
      const next =
        options.databaseFactory?.() ??
        new LocalBudgetDatabaseClient(undefined, storage);
      let oldGenerationProvenSafe = false;

      try {
        const replacement = createRestorePointReplacement({
          database: next,
          relay,
          storage,
          deviceId,
        });

        if (hasPendingRestoreJournal(storage, budgetId)) {
          await replacement.recover(budgetId);
          cachedSyncEpoch = storage.getItem(
            `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
          );
        } else if (
          cachedSyncEpoch &&
          hasPublishedLocalBudgetDatabase(storage, budgetId)
        ) {
          try {
            await next.open({
              budgetId,
              syncEpoch: cachedSyncEpoch,
              deviceId,
            });
            const syncState = await next.getSyncState();
            if (syncState.baselineHash) {
              activePulledCursor = syncState.pulledCursor;
              database = next;
              activeBudgetId = budgetId;
              activeSyncEpoch = cachedSyncEpoch;
              return next;
            }
          } catch (error) {
            const code = (error as { code?: string }).code;
            if (code === "SQLITE_DATABASE_BUSY") throw error;
            if (code !== "STALE_SYNC_EPOCH") throw error;
          }
        }

        let remote = await relay.getBootstrap(budgetId).catch(() => null);
        const recovered = await replacement.recover(budgetId);
        cachedSyncEpoch = storage.getItem(
          `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
        );
        if (recovered) {
          remote = await relay.getBootstrap(budgetId).catch(() => null);
        }
        if (!remote && !cachedSyncEpoch) return null;
        if (
          remote &&
          (!remote.baseline ||
            remote.schemaVersion !== LOCAL_BUDGET_SCHEMA_VERSION)
        ) {
          return null;
        }
        if (!remote) {
          if (
            !cachedSyncEpoch ||
            !hasPublishedLocalBudgetDatabase(storage, budgetId)
          ) {
            return null;
          }
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
        }

        const remoteBaseline = remote.baseline;
        if (!remoteBaseline) return null;

        if (cachedSyncEpoch && cachedSyncEpoch !== remote.syncEpoch) {
          await next.open({
            budgetId,
            syncEpoch: cachedSyncEpoch,
            deviceId,
          });
          const pendingOldGeneration = await next.readOutbox(0, 1);
          if (pendingOldGeneration.length > 0) {
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
            syncState.baselineHash !== remoteBaseline.manifest.contentHash ||
            syncState.pulledCursor < remoteBaseline.manifest.baseCursor ||
            local.counts.accounts !== remoteBaseline.manifest.counts.accounts ||
            local.counts.transactions !== remoteBaseline.manifest.counts.transactions
          ) {
            await drainLocalOutbox(next, budgetId, remote.syncEpoch);
            await bootstrapLocalBudget({
              budgetId,
              deviceId,
              database: next,
              relay,
              localState: syncState.baselineHash
                ? {
                    budgetId,
                    syncEpoch: syncState.syncEpoch,
                    baselineHash: syncState.baselineHash,
                    pulledCursor: syncState.pulledCursor,
                  }
                : null,
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
          throw error;
        }
      } finally {
        if (database !== next) await next.close();
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

  async function synchronise(
    budgetId: string,
  ): Promise<import("../accountRegisterQueryContracts").LocalBudgetSynchronisationResult> {
    if (synchronising) {
      if (synchronising.budgetId === budgetId) return synchronising.promise;
      await synchronising.promise;
      return synchronise(budgetId);
    }
    const operation = tabSyncCoordinator.run(budgetId, async () => {
      const local = await requireDatabase(budgetId);
      let syncState = await local.getSyncState();
      const remote = await relay.getBootstrap(budgetId);

      if (
        !remote.baseline ||
        remote.schemaVersion !== LOCAL_BUDGET_SCHEMA_VERSION
      ) {
        throw new Error("The relay does not contain a complete compatible budget baseline.");
      }

      const remoteBaseline = remote.baseline;
      if (!remoteBaseline) {
        throw new Error("The relay does not contain a complete compatible budget baseline.");
      }

      const needsRebuild =
        remote.syncEpoch !== activeSyncEpoch ||
        syncState.baselineHash !== remoteBaseline.manifest.contentHash ||
        syncState.pulledCursor < remoteBaseline.manifest.baseCursor;

      if (needsRebuild) {
        const pending = await local.readOutbox(0, 1);
        if (
          remote.syncEpoch !== activeSyncEpoch &&
          pending.length > 0
        ) {
          throw Object.assign(
            new Error(
              "This device has unsynced local changes from the previous sync generation. " +
              "They must be recovered explicitly before rebuilding from the relay.",
            ),
            { code: "UNSYNCED_LOCAL_CHANGES" },
          );
        }

        if (remote.syncEpoch === activeSyncEpoch) {
          await drainLocalOutbox(local, budgetId, activeSyncEpoch!);
        }

        const rebuilt = await bootstrapLocalBudget({
          budgetId,
          deviceId,
          database: local,
          relay,
          localState: syncState.baselineHash
            ? {
                budgetId,
                syncEpoch: syncState.syncEpoch,
                baselineHash: syncState.baselineHash,
                pulledCursor: syncState.pulledCursor,
              }
            : null,
        });
        if (!rebuilt.deviceState) {
          throw new Error("The relay has no restorable baseline for this budget.");
        }
        activeSyncEpoch = rebuilt.deviceState.syncEpoch;
        activePulledCursor = rebuilt.deviceState.pulledCursor;
        storage.setItem(
          `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
          rebuilt.deviceState.syncEpoch,
        );
        syncState = await local.getSyncState();
        publishBroadBudgetChange({
          budgetId,
          source: "replication",
        });
      }

      let cursor = syncState.pulledCursor;
      while (true) {
        try {
          const convergence = await convergeLocalFirstMutations({
            local,
            relay,
            budgetId,
            syncEpoch: activeSyncEpoch!,
            pulledCursor: cursor,
            onRemoteMutationsApplied: (mutations) => {
              notifyRemoteMutationsApplied(budgetId, mutations);
            },
          });
          cursor = convergence.pulledCursor;
          activePulledCursor = convergence.pulledCursor;
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "CURSOR_COMPACTED") {
            throw error;
          }
          const currentState = await local.getSyncState();
          const rebuilt = await bootstrapLocalBudget({
            budgetId,
            deviceId,
            database: local,
            relay,
            localState: currentState.baselineHash
              ? {
                  budgetId,
                  syncEpoch: currentState.syncEpoch,
                  baselineHash: currentState.baselineHash,
                  pulledCursor: currentState.pulledCursor,
                }
              : null,
          });
          if (!rebuilt.deviceState) {
            throw new Error("The compacted relay has no restorable baseline.");
          }
          cursor = rebuilt.deviceState.pulledCursor;
          activePulledCursor = cursor;
          activeSyncEpoch = rebuilt.deviceState.syncEpoch;
          storage.setItem(
            `${SYNC_EPOCH_KEY_PREFIX}${budgetId}`,
            rebuilt.deviceState.syncEpoch,
          );
          publishBroadBudgetChange({
            budgetId,
            source: "replication",
          });
        }
      }
      return {
        generationId: activeSyncEpoch!,
        pulledCursor: activePulledCursor,
      };
    }).finally(() => {
      if (synchronising?.promise === operation) synchronising = null;
    });
    synchronising = { budgetId, promise: operation };
    return operation;
  }

  async function syncThenDatabase(budgetId: string) {
    return requireDatabase(budgetId);
  }


  const mutation = mutationContext.createMutation.bind(mutationContext);

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

  async function listSchedules(
    budgetId: string,
    accountId: string,
    syncBeforeRead = true,
  ) {
    const local = syncBeforeRead
      ? await syncThenDatabase(budgetId)
      : await requireDatabase(budgetId);
    return local.listEntities<ScheduledTransactionView>("scheduledTransactions")
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
    const local = syncBeforeRead
      ? await syncThenDatabase(budgetId)
      : await requireDatabase(budgetId);
    const schedules = await local.listEntities<ScheduledTransactionView>("scheduledTransactions");
    return schedules.find(({ id }) => id === scheduleId) ?? null;
  }

  const tagCommands = createTagCommands({
    requireDatabase,
    createMutation: mutation,
  });
  const attachmentCommands = createAttachmentCommands({
    requireDatabase,
    createMutation: mutation,
    encodeBase64,
  });
  const transactionCommands = createTransactionCommands({
    requireDatabase,
    createMutation: mutation,
  });
  const accountCommands = createAccountCommands({
    requireDatabase,
    createMutation: mutation,
  });
  const budgetCategoryCommands = createBudgetCategoryCommands({
    requireDatabase,
    createMutation: mutation,
  });
  const categoryGoalCommands = createCategoryGoalCommands({
    requireDatabase,
    createMutation: mutation,
  });
  const payeeCommands = createPayeeCommands({
    requireDatabase,
    createMutation: mutation,
  });
  const scheduledTransactionCommands = createScheduledTransactionCommands({
    requireDatabase,
    createMutation: mutation,
    encodeBase64,
    decodeBase64,
  });
  const transactionHistoryCommands = createTransactionHistoryCommands({
    requireDatabase,
    createMutation: mutation,
    encodeBase64,
  });
  const ordinaryCommandHandlers = createOrdinaryCommandHandlerRegistry({
    ...categoryGoalCommands,
    ...accountCommands,
    ...transactionCommands,
    ...transactionHistoryCommands,
    addTransactionAttachment: attachmentCommands.addTransactionAttachment,
    removeTransactionAttachment: attachmentCommands.removeTransactionAttachment,
    ...budgetCategoryCommands,
    ...payeeCommands,
    replaceTransactionTags: tagCommands.replaceTransactionTags,
    replaceTransactionTagsHistoryState: tagCommands.replaceTransactionTagsHistoryState,
    ...scheduledTransactionCommands,
  });
  const publicOrdinaryCommands = createPublicOrdinaryCommandFacade(ordinaryCommandHandlers);

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
  ): Promise<readonly LocalBudgetMutation[]> {
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

      const writes = operationGroup.members.map((member) => {
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
        });
      await local.writeTransactionBatch(writes);
      return writes.map(({ mutation: replay }) => replay);
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

    const deletes = operationGroup.members.map((member) => {
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
      });
    await local.deleteTransactionBatch(deletes);
    return deletes.map(({ mutation: replay }) => replay);
  }

  async function replayConflictMutation(
    local: LocalBudgetDatabaseClient,
    original: LocalBudgetMutation,
    conflictId: string,
  ): Promise<LocalBudgetMutation> {
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
      return replay;
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
      return replay;
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
      return replay;
    }
    if (original.domain === "payees" && original.operation === "upsert") {
      await local.writePayee(
        original.payload as import("./registerSchema").LocalPayeeRecord,
        replay,
        conflictId,
      );
      return replay;
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
        return replay;
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
        return replay;
      }
    }
    await local.mutate(replay, conflictId);
    return replay;
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

  async function keepLocalRecovery(
    budgetId: string,
    conflictId: string,
  ): Promise<CommittedCommandHandlerResult<void>> {
    const local = await requireDatabase(budgetId);
    const unresolvedConflicts = await local.listSyncConflicts("unresolved", 500);
    const conflict = unresolvedConflicts.find((value) => value.conflictId === conflictId);
    if (!conflict) throw new Error("The synchronization conflict was not found.");
    const losingMutation = conflict.losingMutation;
    const transferPayload = losingMutation.domain === "transactions" &&
      !losingMutation.entityId.startsWith("attachment:")
      ? losingMutation.payload as { transferAccountId?: string | null; transferTransactionId?: string | null } | null
      : null;
    const isLinkedTransfer = Boolean(transferPayload?.transferAccountId) ||
      Boolean(transferPayload?.transferTransactionId);
    const replays = isLinkedTransfer && losingMutation.operationGroupId
      ? await replayGroupedTransferConflicts(local, conflict, unresolvedConflicts)
      : [await replayConflictMutation(local, losingMutation, conflictId)];
    return committedCommandResult(undefined, replays,
      persistenceScopeForMutations(budgetId, [losingMutation]));
  }

  async function releaseLocalDatabase(deletingBudgetId?: string) {
    await opening?.catch(() => null);
    await synchronising?.promise.catch(() => undefined);
    // A deleted budget has no product recovery workflow. Other open budgets
    // still require their usual safety capture before giving up ownership.
    if (database && activeBudgetId && activeBudgetId !== deletingBudgetId) {
      await captureOwnedRestorePoint(activeBudgetId, "before-switch");
    }
    await database?.close();
    database = null;
    activeBudgetId = null;
    activeSyncEpoch = null;
    activePulledCursor = 0;
  }

  const client: LocalBudgetRuntimeClient & LocalBudgetConflictRecoveryClient & {
    publishLocalBaseline(budgetId: string): Promise<boolean>;
  } = {
    releaseLocalDatabase: () => releaseLocalDatabase(),
    synchroniseLocalBudget: synchronise,
    getBudgetExportUrl: lifecycle.getBudgetExportUrl,
    listRestorePoints: (budgetId) => restorePoints.list(budgetId),
    createRestorePoint: captureOwnedRestorePoint,
    async restoreRestorePoint(budgetId, pointId) {
      await synchronise(budgetId);
      const local = await requireDatabase(budgetId);
      await captureOwnedRestorePoint(budgetId, "before-restore");
      const manifest = await createRestorePointReplacement({ database: local, relay, storage, deviceId }).restore(budgetId, pointId);
      activeSyncEpoch = manifest.syncEpoch;
      activePulledCursor = 0;
      publishBroadBudgetChange({ budgetId, source: "restore" });
      return { restored: true, counts: { ...manifest.counts, transactionTagAssignments: 0 } };
    },
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
      await captureOwnedRestorePoint(budgetId, "before-restore");
      const manifest = await createRestorePointReplacement({ database: local, relay, storage, deviceId })
        .restoreDatabase(budgetId, file);
      activeSyncEpoch = manifest.syncEpoch;
      activePulledCursor = 0;
      publishBroadBudgetChange({ budgetId, source: "restore" });
      return { restored: true, counts: { ...manifest.counts, transactionTagAssignments: 0 } };
    },
    async resetBudget(budgetId) {
      const local = await requireDatabase(budgetId);
      await captureOwnedRestorePoint(budgetId, "before-reset");
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
      publishBroadBudgetChange({ budgetId, source: "restore" });
    },
    async deleteBudget(budgetId) {
      const local = await readyDatabase(budgetId);
      await lifecycle.deleteBudget(budgetId);
      try {
        await restorePoints.deleteBudget(budgetId);
      } catch (error) {
        // Authoritative deletion is committed. Storage cleanup cannot undo it or
        // prevent registry removal; retain the existing boundary for diagnostics.
        console.warn("Budget deleted; restore-point storage cleanup failed.", Object.assign(
          new Error("Post-delete restore-point storage cleanup failed.", { cause: error }),
          { authoritativeDeletionCompleted: true, budgetId },
        ));
      }
      try {
        await local?.deleteBudgetFile();
        await local?.close();
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
      if (resolution !== "keep-local") await synchronise(budgetId);
      if (resolution === "keep-local") {
        await keepLocalRecovery(budgetId, conflictId);
        return;
      }
      const local = await requireDatabase(budgetId);
      const conflict = (await local.listSyncConflicts("unresolved", 500))
        .find((value) => value.conflictId === conflictId);
      if (!conflict) throw new Error("The synchronization conflict was not found.");
      await local.resolveSyncConflict(conflictId, resolution);
    },
    async getBudgetStatus(budgetId) {
      const local = await requireDatabase(budgetId);
      const syncState = await local.getSyncState();
      return {
        budgetId,
        generationId: syncState.syncEpoch,
        state: "active",
        activatedAt: null,
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
    async queryLocalTransactions(input) {
      return (await requireDatabase(input.budgetId)).queryTransactions({
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
    restoreTransactionHistorySnapshot: publicOrdinaryCommands.restoreTransactionHistorySnapshot,
    deleteTransactionHistorySnapshot: publicOrdinaryCommands.deleteTransactionHistorySnapshot,
    replaceTransactionHistorySnapshot: publicOrdinaryCommands.replaceTransactionHistorySnapshot,
    addTransaction: publicOrdinaryCommands.addTransaction,
    commitTransactionBatch: publicOrdinaryCommands.commitTransactionBatch,

    commitImportBatch: publicOrdinaryCommands.commitImportBatch,
    commitImportBatchWithHistory: publicOrdinaryCommands.commitImportBatchWithHistory,
    replaceImportHistorySnapshot: publicOrdinaryCommands.replaceImportHistorySnapshot,

    moveTransactions: publicOrdinaryCommands.moveTransactions,
    updateTransaction: publicOrdinaryCommands.updateTransaction,
    toggleTransactionCleared: publicOrdinaryCommands.toggleTransactionCleared,
    setTransactionsCleared: publicOrdinaryCommands.setTransactionsCleared,
    deleteTransaction: publicOrdinaryCommands.deleteTransaction,
    addTransactionAttachment: publicOrdinaryCommands.addTransactionAttachment,
    removeTransactionAttachment: publicOrdinaryCommands.removeTransactionAttachment,
    readTransactionAttachment: attachmentCommands.readTransactionAttachment,
    async listAccounts(budgetId) {
      const local = await syncThenDatabase(budgetId);
      return (await local.listAccounts(budgetId)).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as never,
        startingBalance: row.openingBalance / 100,
        createdAt: row.createdAt,
        closedAt: row.closedAt ?? undefined,
      }));
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
    async getCategoryGoal(input) {
      return (await syncThenDatabase(input.budgetId)).getCategoryGoal(input.budgetId, input.categoryId);
    },
    async listCategoryGoals(input) {
      return (await syncThenDatabase(input.budgetId)).listCategoryGoals(input.budgetId);
    },
    createCategoryGoal: publicOrdinaryCommands.createCategoryGoal,
    updateCategoryGoal: publicOrdinaryCommands.updateCategoryGoal,
    deleteCategoryGoal: publicOrdinaryCommands.deleteCategoryGoal,
    replaceCategoryGoalHistoryState: publicOrdinaryCommands.replaceCategoryGoalHistoryState,
    createAccount: publicOrdinaryCommands.createAccount,
    async captureAccount(budgetId, accountId) {
      return (await syncThenDatabase(budgetId)).readAccountForHistory(accountId);
    },
    replaceAccountHistoryState: publicOrdinaryCommands.replaceAccountHistoryState,
    replaceBudgetMonthHistoryState: publicOrdinaryCommands.replaceBudgetMonthHistoryState,
    updateAccount: publicOrdinaryCommands.updateAccount,
    setAccountClosed: publicOrdinaryCommands.setAccountClosed,
    deleteAccount: publicOrdinaryCommands.deleteAccount,
    async getBudgetMonthView(input) {
      await syncThenDatabase(input.budgetId);
      return client.getLocalBudgetMonthView(input);
    },
    async getLocalBudgetMonthView(input) {
      const local = await requireDatabase(input.budgetId);
      const view = await local.readEntity<BudgetMonthView>(
        "budgetMonths",
        input.month,
      );
      if (!view) throw new Error(`Budget month ${input.month} is not available locally.`);
      if (storage.getItem(BUDGET_ENGINE_DIAGNOSTIC_STORAGE_KEY) === "true") {
        await local.getBudgetProjectionDiagnostic(input.budgetId, input.month).then(
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
    setCategoryAssignedValues: publicOrdinaryCommands.setCategoryAssignedValues,
    async executeAssignmentsWithPublication() {
      throw new Error("The publication completion requires the ownership proxy.");
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
    mutateCategory: publicOrdinaryCommands.mutateCategory,
    async executeCategoryWithPublication() {
      throw new Error("The publication completion requires the ownership proxy.");
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
    keepPayeesSeparate: publicOrdinaryCommands.keepPayeesSeparate,
    replacePayeeDuplicateSuppressionsHistoryState: publicOrdinaryCommands.replacePayeeDuplicateSuppressionsHistoryState,
    createPayee: publicOrdinaryCommands.createPayee,
    async capturePayee(budgetId, payeeId) {
      const all = [
        ...await client.listPayees(budgetId, false),
        ...await client.listPayees(budgetId, true),
      ];
      return all.find(({ id }) => id === payeeId) ?? null;
    },
    replacePayeeHistoryState: publicOrdinaryCommands.replacePayeeHistoryState,
    updatePayee: publicOrdinaryCommands.updatePayee,
    setPayeeArchived: publicOrdinaryCommands.setPayeeArchived,
    deleteUnusedPayee: publicOrdinaryCommands.deleteUnusedPayee,
    mergePayees: publicOrdinaryCommands.mergePayees,
    async listTransactionTags(budgetId) {
      return (await syncThenDatabase(budgetId)).listEntities<TransactionTagDefinition>("transactionTags");
    },
    replaceTransactionTags: publicOrdinaryCommands.replaceTransactionTags,
    replaceTransactionTagsHistoryState: publicOrdinaryCommands.replaceTransactionTagsHistoryState,
    listScheduledTransactions(budgetId, accountId) {
      return listSchedules(budgetId, accountId);
    },
    captureScheduledTransaction(budgetId, scheduleId) {
      return captureSchedule(budgetId, scheduleId);
    },
    replaceScheduledTransactionHistoryState: publicOrdinaryCommands.replaceScheduledTransactionHistoryState,
    enterScheduledTransaction: publicOrdinaryCommands.enterScheduledTransaction,
    createScheduledTransaction: publicOrdinaryCommands.createScheduledTransaction,
    updateScheduledTransaction: publicOrdinaryCommands.updateScheduledTransaction,
    deleteScheduledTransaction: publicOrdinaryCommands.deleteScheduledTransaction,
    advanceScheduledTransaction: publicOrdinaryCommands.advanceScheduledTransaction,
    renameScheduledPayeeReferences: publicOrdinaryCommands.renameScheduledPayeeReferences,
    reassignScheduledPayeeReferences: publicOrdinaryCommands.reassignScheduledPayeeReferences,
  };
  const ownership = createBudgetDatabaseOwnership(() => client.releaseLocalDatabase!());
  // The raw client is deliberately retained for nested calls. Wrapping those
  // calls again would deadlock the operation already holding the lease.
  const methods = new Map<PropertyKey, unknown>();
  const owned = new Proxy(client, {
    get(target, key) {
      if (key === "releaseLocalDatabase") return ownership.leave;
      if (key === "activateLocalBudget") return ownership.enter;
      if (key === "isLocalDatabaseReleased") return ownership.isReleased;
      if (key === "runWithExclusiveLocalDatabase") return ownership.exclusive;
      if (methods.has(key)) return methods.get(key);
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      if (key === "getBudgetStatus" || key === "getBudgetExportUrl") {
        const method = value.bind(target);
        methods.set(key, method);
        return method;
      }
      if (key === "prefetchAccountRegister" || key === "prefetchBudgetMonthView") {
        const method = (input: { budgetId: string } & Record<string, unknown>) => {
          if (ownership.isReleased()) return;
          void ownership.run<unknown>(input.budgetId, () => key === "prefetchAccountRegister"
            ? target.getAccountRegisterBootstrap(input as never)
            : target.getBudgetMonthView(input as never)).catch(() => undefined);
        };
        methods.set(key, method);
        return method;
      }
      const method = (...args: unknown[]) => {
        // Deleting a launcher entry explicitly owns a temporary database and
        // leaves it closed. Restore/reset reuse the active client's lease.
        if (key === "deleteBudget") return ownership.exclusive(async () => {
          try { return await value.apply(target, args); }
          finally { await releaseLocalDatabase(args[0] as string); }
        }, () => releaseLocalDatabase(args[0] as string));
        const budgetId = resolveOwnedBudgetId(key, args);
        if (key === "executeCategoryWithPublication" || key === "executeAssignmentsWithPublication") {
          const handler = key === "executeCategoryWithPublication"
            ? ordinaryCommandHandlers.mutateCategory
            : ordinaryCommandHandlers.setCategoryAssignedValues;
          const handlerArgs = key === "executeCategoryWithPublication" ? args : [args[0]];
          const invokeHandler = () => ownership.run(
            budgetId,
            () => Reflect.apply(handler.execute, handler, handlerArgs),
          ) as Promise<CommittedCommandHandlerResult<unknown>>;
          return commandExecutor.execute(`${String(key)}:${createRuntimeUuid()}`, { execute: invokeHandler });
        }
        if (isOrdinaryCommandMethod(key)) {
          const handler = ordinaryCommandHandlers[key];
          const invokeHandler = () => ownership.run(
            budgetId,
            () => Reflect.apply(handler.execute, handler, args),
          ) as Promise<CommittedCommandHandlerResult<unknown>>;
          return commandExecutor.execute(`${key}:${createRuntimeUuid()}`, { execute: invokeHandler })
            .then(({ result }) => result);
        }
        // Keep-local recovery has its own direct committed-result path and is
        // deliberately not admitted into the ordinary command registry.
        if (key === "resolveSyncConflict" && args[2] === "keep-local") {
          const invokeRecovery = () => ownership.run(
            budgetId,
            () => keepLocalRecovery(budgetId, args[1] as string),
          );
          return commandExecutor.execute(`${key}:${createRuntimeUuid()}`, { execute: invokeRecovery })
            .then(({ result }) => result);
        }
        return ownership.run(budgetId, () => value.apply(target, args));
      };
      methods.set(key, method);
      return method;
    },
  });
  registerLocalSqliteAttachmentReader((budgetId, attachmentId) =>
    owned.readTransactionAttachment({ budgetId, attachmentId }));
  return owned;
}

function toLocalQuery(input: AccountTransactionQuery) {
  return {
    budgetId: input.budgetId,
    accountId: input.accountId,
    limit: input.limit,
    offset: input.offset,
    before: input.before,
    dateRange: input.dateRange,
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
