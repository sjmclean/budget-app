import type {
  LocalBudgetRuntimeClient,
  TransactionWriteInput,
} from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import type { ScheduledTransactionView } from "../../../accounts/scheduledTransactionTypes";
import {
  advanceScheduledTransaction,
  buildScheduledTransaction,
} from "../../../accounts/scheduledTransactionLifecycle";
import { scheduledTransactionToRegisterInput } from "../../../accounts/scheduledTransactionToRegisterInput";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";
import {
  deriveTransactionChangeScope,
  mergePersistenceChangeScopes,
} from "../persistenceChangeImpact";
import type { TransactionHistorySnapshot } from "../registerSchema";
import { buildNewTransactionRecords } from "./transactionCommandHelpers";

type ScheduledTransactionCommands = Pick<
  LocalBudgetRuntimeClient,
  | "replaceScheduledTransactionHistoryState"
  | "enterScheduledTransaction"
  | "createScheduledTransaction"
  | "updateScheduledTransaction"
  | "deleteScheduledTransaction"
  | "advanceScheduledTransaction"
  | "renameScheduledPayeeReferences"
  | "reassignScheduledPayeeReferences"
>;

type CreateMutation = (
  budgetId: string,
  domain: LocalBudgetMutation["domain"],
  entityId: string,
  operation: LocalBudgetMutation["operation"],
  payload: unknown,
  operationGroupId?: string,
  operationGroup?: LocalBudgetOperationGroup,
) => LocalBudgetMutation;

export interface ScheduledTransactionCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
  readonly recordCommittedChange: (
    budgetId: string,
    change: Omit<PersistenceChangeScope, "budgetId">,
  ) => void;
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
  local: LocalBudgetDatabaseClient,
  accountId: string,
): Promise<readonly ScheduledTransactionView[]> {
  return local.listEntities<ScheduledTransactionView>("scheduledTransactions")
    .then((rows) => rows
      .filter((row) => row.accountId === accountId)
      .sort((left, right) =>
        left.nextDueDate.localeCompare(right.nextDueDate) || left.id.localeCompare(right.id)));
}

async function captureSchedule(
  local: LocalBudgetDatabaseClient,
  scheduleId: string,
): Promise<ScheduledTransactionView | null> {
  const schedules = await local.listEntities<ScheduledTransactionView>("scheduledTransactions");
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
      domain: "scheduledTransactions",
      entityId: input.scheduleId,
      operation: input.replacementSchedule ? "upsert" : "delete",
      payload: input.replacementSchedule,
    },
    ...(input.expectedTransaction?.transactions ?? [])
      .filter(({ id }) => !nextTransactionIds.has(id))
      .map((transaction) => ({
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
    ...(input.expectedTransaction?.attachments ?? [])
      .filter(({ id }) => !nextAttachmentIds.has(id))
      .map((attachment) => ({
        domain: "transactions" as const,
        entityId: `attachment:${attachment.id}`,
        operation: "delete" as const,
        payload: {
          kind: "transaction-attachment-delete" as const,
          attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
        },
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
      payload: {
        kind: "transaction-attachment-upsert" as const,
        attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
        contentBase64: (() => {
          let binary = "";
          const chunkSize = 32 * 1024;
          for (let offset = 0; offset < attachment.content.length; offset += chunkSize) {
            binary += String.fromCharCode(...attachment.content.subarray(offset, offset + chunkSize));
          }
          return btoa(binary);
        })(),
      },
    })),
  ];
}

/** Final implementation owner for ordinary scheduled-transaction commands. */
export function createScheduledTransactionCommands(
  dependencies: ScheduledTransactionCommandDependencies,
): ScheduledTransactionCommands {
  async function replaceScheduledTransactionHistoryState(input: Parameters<LocalBudgetRuntimeClient["replaceScheduledTransactionHistoryState"]>[0]) {
    const local = await dependencies.requireDatabase(input.budgetId);
    const members = scheduledHistoryMembers(input);
    const operationGroupId = createRuntimeUuid();
    const group: LocalBudgetOperationGroup = { members };
    const committedMutations = members.map((member) => dependencies.createMutation(
      input.budgetId,
      member.domain,
      member.entityId,
      member.operation,
      member.payload,
      operationGroupId,
      group,
    ));
    await local.replaceScheduledTransactionHistoryState({
      scheduleId: input.scheduleId,
      expectedSchedule: input.expectedSchedule,
      replacementSchedule: input.replacementSchedule,
      expectedTransaction: input.expectedTransaction,
      replacementTransaction: input.replacementTransaction,
      mutations: committedMutations,
    });
    dependencies.recordCommittedChange(
      input.budgetId,
      input.expectedTransaction || input.replacementTransaction
        ? mergePersistenceChangeScopes(
            input.budgetId,
            persistenceScopeForMutations(input.budgetId, committedMutations),
            deriveTransactionChangeScope({
              budgetId: input.budgetId,
              before: input.expectedTransaction?.transactions,
              after: input.replacementTransaction?.transactions,
            }),
          )
        : persistenceScopeForMutations(input.budgetId, committedMutations),
    );
  }

  async function writeSchedule(
    local: LocalBudgetDatabaseClient,
    budgetId: string,
    scheduleId: string,
    payload: ScheduledTransactionView | null,
    operation: "upsert" | "delete",
  ): Promise<void> {
    const committedMutation = dependencies.createMutation(
      budgetId,
      "scheduledTransactions",
      scheduleId,
      operation,
      payload,
    );
    await local.mutate(committedMutation);
    dependencies.recordCommittedChange(
      budgetId,
      persistenceScopeForMutations(budgetId, [committedMutation]),
    );
  }

  async function rewriteScheduledPayeeReferences(
    budgetId: string,
    predicate: (schedule: ScheduledTransactionView) => boolean,
    update: (schedule: ScheduledTransactionView) => ScheduledTransactionView,
  ): Promise<void> {
    const local = await dependencies.requireDatabase(budgetId);
    const current = await local.listEntities<ScheduledTransactionView>("scheduledTransactions");
    const next = current.filter(predicate).map(update);
    if (next.length === 0) return;
    const members: LocalBudgetOperationGroup["members"] = next.map((schedule) => ({
      domain: "scheduledTransactions",
      entityId: schedule.id,
      operation: "upsert",
      payload: schedule,
    }));
    const operationGroupId = createRuntimeUuid();
    const operationGroup: LocalBudgetOperationGroup = { members };
    const mutations = members.map((member) => dependencies.createMutation(
      budgetId,
      member.domain,
      member.entityId,
      member.operation,
      member.payload,
      operationGroupId,
      operationGroup,
    ));
    await local.mutateBatch(mutations);
    dependencies.recordCommittedChange(
      budgetId,
      persistenceScopeForMutations(budgetId, mutations),
    );
  }

  return {
    replaceScheduledTransactionHistoryState,

    async enterScheduledTransaction(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const current = await captureSchedule(local, input.schedule.id);
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
      await replaceScheduledTransactionHistoryState({
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
      const local = await dependencies.requireDatabase(budgetId);
      const schedule = buildScheduledTransaction(input);
      await writeSchedule(local, budgetId, schedule.id, schedule, "upsert");
      return listSchedules(local, input.accountId);
    },

    async updateScheduledTransaction(budgetId, scheduleId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const existing = (await listSchedules(local, input.accountId))
        .find(({ id }) => id === scheduleId);
      if (!existing) throw new Error("The local scheduled transaction was not found.");
      const schedule = buildScheduledTransaction(input, { existing });
      await writeSchedule(local, budgetId, schedule.id, schedule, "upsert");
      return listSchedules(local, input.accountId);
    },

    async deleteScheduledTransaction(budgetId, accountId, scheduleId) {
      const local = await dependencies.requireDatabase(budgetId);
      await writeSchedule(local, budgetId, scheduleId, null, "delete");
      return listSchedules(local, accountId);
    },

    async advanceScheduledTransaction(budgetId, accountId, scheduleId) {
      const local = await dependencies.requireDatabase(budgetId);
      const existing = (await listSchedules(local, accountId))
        .find(({ id }) => id === scheduleId);
      if (!existing) return listSchedules(local, accountId);
      const result = advanceScheduledTransaction(existing);
      if (result.action === "delete") {
        await writeSchedule(local, budgetId, scheduleId, null, "delete");
      } else {
        await writeSchedule(local, budgetId, scheduleId, result.transaction, "upsert");
      }
      return listSchedules(local, accountId);
    },

    renameScheduledPayeeReferences(budgetId, input) {
      return rewriteScheduledPayeeReferences(
        budgetId,
        (schedule) =>
          schedule.payeeId === input.payeeId || schedule.payee === input.previousName,
        (schedule) => ({
          ...schedule,
          payee: input.nextName,
          updatedAt: new Date().toISOString(),
        }),
      );
    },

    reassignScheduledPayeeReferences(budgetId, input) {
      return rewriteScheduledPayeeReferences(
        budgetId,
        (schedule) =>
          schedule.payeeId === input.sourcePayeeId || schedule.payee === input.sourceName,
        (schedule) => ({
          ...schedule,
          payeeId: input.targetPayeeId,
          payee: input.targetName,
          updatedAt: new Date().toISOString(),
        }),
      );
    },
  };
}
