import type { LocalBudgetRuntimeClient, TransactionWriteInput } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { advanceScheduledTransaction, buildScheduledTransaction } from "../../../accounts/scheduledTransactionLifecycle";
import { scheduledTransactionToRegisterInput } from "../../../accounts/scheduledTransactionToRegisterInput";
import type { ScheduledTransactionView } from "../../../accounts/scheduledTransactionTypes";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import { persistenceScopeForMutations } from "../mutationEvents";
import { deriveTransactionChangeScope, mergePersistenceChangeScopes } from "../persistenceChangeImpact";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import type { TransactionHistorySnapshot } from "../registerSchema";
import { buildNewTransactionRecords } from "./transactionCommandHelpers";
import { committedCommandResult, emptyCommandChange, type CommittedCommandMethods } from "./commandContext";

type ScheduledCommands = Pick<LocalBudgetRuntimeClient,
  | "replaceScheduledTransactionHistoryState" | "enterScheduledTransaction"
  | "createScheduledTransaction" | "updateScheduledTransaction"
  | "deleteScheduledTransaction" | "advanceScheduledTransaction"
  | "renameScheduledPayeeReferences" | "reassignScheduledPayeeReferences"
>;

type CreateMutation = (budgetId: string, domain: LocalBudgetMutation["domain"], entityId: string,
  operation: LocalBudgetMutation["operation"], payload: unknown, operationGroupId?: string,
  operationGroup?: LocalBudgetOperationGroup) => LocalBudgetMutation;

export interface ScheduledTransactionCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
  readonly encodeBase64: (bytes: Uint8Array) => string;
  readonly decodeBase64: (value: string) => Uint8Array;
}

async function listSchedules(local: LocalBudgetDatabaseClient, accountId: string) {
  return (await local.listEntities<ScheduledTransactionView>("scheduledTransactions"))
    .filter((row) => row.accountId === accountId)
    .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate) || left.id.localeCompare(right.id));
}

async function findSchedule(local: LocalBudgetDatabaseClient, scheduleId: string) {
  return (await local.listEntities<ScheduledTransactionView>("scheduledTransactions"))
    .find(({ id }) => id === scheduleId) ?? null;
}

function scheduledRegisterWrite(budgetId: string, accountId: string, schedule: ScheduledTransactionView): TransactionWriteInput {
  const input = scheduledTransactionToRegisterInput(schedule);
  return { budgetId, accountId, date: input.date, amount: Math.round((input.inflow - input.outflow) * 100),
    payeeId: input.payeeId, payeeName: input.payee, transferAccountId: input.transferAccountId,
    categoryId: input.categoryId, categoryName: input.category,
    incomeBudgetMonth: input.incomeBudgetMonth,
    inflowClassification: input.inflowClassification,
    memo: input.memo, tagIds: input.tagIds,
    generatedFromSchedule: true, scheduledTransactionId: schedule.id,
    scheduledOccurrenceDate: input.scheduledOccurrenceDate,
    splitLines: (input.splitLines ?? []).map((line) => ({ id: line.id, categoryId: line.categoryId,
      categoryName: line.category, incomeBudgetMonth: line.incomeBudgetMonth,
      inflowClassification: line.inflowClassification, transferAccountId: line.transferAccountId,
      transferTransactionId: line.transferTransactionId, memo: line.memo,
      amount: Math.round((line.inflow - line.outflow) * 100) })) };
}

function historyMembers(input: Parameters<NonNullable<ScheduledCommands["replaceScheduledTransactionHistoryState"]>>[0], encodeBase64: (bytes: Uint8Array) => string): LocalBudgetOperationGroup["members"] {
  const nextTransactionIds = new Set(input.replacementTransaction?.transactions.map(({ id }) => id) ?? []);
  const nextAttachmentIds = new Set(input.replacementTransaction?.attachments.map(({ id }) => id) ?? []);
  return [{ domain: "scheduledTransactions", entityId: input.scheduleId,
    operation: input.replacementSchedule ? "upsert" : "delete", payload: input.replacementSchedule },
  ...(input.expectedTransaction?.transactions ?? []).filter(({ id }) => !nextTransactionIds.has(id)).map((transaction) => ({
    domain: "transactions" as const, entityId: transaction.id, operation: "delete" as const,
    payload: { accountId: transaction.accountId, amount: transaction.amount,
      transferAccountId: transaction.transferAccountId, transferTransactionId: transaction.transferTransactionId } })),
  ...(input.expectedTransaction?.attachments ?? []).filter(({ id }) => !nextAttachmentIds.has(id)).map((attachment) => ({
    domain: "transactions" as const, entityId: `attachment:${attachment.id}`, operation: "delete" as const,
    payload: { kind: "transaction-attachment-delete" as const,
      attachment: (({ content: _content, ...metadata }) => metadata)(attachment) } })),
  ...(input.replacementTransaction?.transactions ?? []).map((transaction) => ({ domain: "transactions" as const,
    entityId: transaction.id, operation: "upsert" as const, payload: transaction })),
  ...(input.replacementTransaction?.attachments ?? []).map((attachment) => ({ domain: "transactions" as const,
    entityId: `attachment:${attachment.id}`, operation: "upsert" as const,
    payload: { kind: "transaction-attachment-upsert" as const,
      attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
      contentBase64: encodeBase64(attachment.content) } }))];
}

export function createScheduledTransactionCommands(dependencies: ScheduledTransactionCommandDependencies): CommittedCommandMethods<ScheduledCommands> {
  async function replaceHistory(input: Parameters<ScheduledCommands["replaceScheduledTransactionHistoryState"]>[0]) {
    const local = await dependencies.requireDatabase(input.budgetId);
    const members = historyMembers(input, dependencies.encodeBase64);
    const operationGroupId = createRuntimeUuid();
    const group: LocalBudgetOperationGroup = { members };
    const mutations = members.map((member) => dependencies.createMutation(input.budgetId, member.domain,
      member.entityId, member.operation, member.payload, operationGroupId, group));
    const { registerDelta } = await local.replaceScheduledTransactionHistoryState({ ...input, mutations });
    const mutationScope = persistenceScopeForMutations(input.budgetId, mutations);
    const change = input.expectedTransaction || input.replacementTransaction
      ? mergePersistenceChangeScopes(input.budgetId, mutationScope, deriveTransactionChangeScope({
          budgetId: input.budgetId, before: input.expectedTransaction?.transactions,
          after: input.replacementTransaction?.transactions }))
      : mutationScope;
    return committedCommandResult(undefined, mutations, change, registerDelta);
  }

  async function writeSchedule(local: LocalBudgetDatabaseClient, budgetId: string, scheduleId: string,
    payload: ScheduledTransactionView | null) {
    const mutation = dependencies.createMutation(budgetId, "scheduledTransactions", scheduleId,
      payload ? "upsert" : "delete", payload);
    await local.mutate(mutation);
    return committedCommandResult(undefined, [mutation], persistenceScopeForMutations(budgetId, [mutation]));
  }

  return {
    replaceScheduledTransactionHistoryState: replaceHistory,
    async enterScheduledTransaction(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const current = await findSchedule(local, input.schedule.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(input.schedule))
        throw new Error("The scheduled transaction no longer matches its expected state.");
      const advanced = advanceScheduledTransaction(current);
      const afterSchedule = advanced.action === "delete" ? null : advanced.transaction;
      let transaction: TransactionHistorySnapshot | null = null;
      if (input.createTransaction) {
        const records = await buildNewTransactionRecords(local, input.transactionId,
          scheduledRegisterWrite(input.budgetId, input.accountId, current));
        const attachedAt = new Date().toISOString();
        transaction = { budgetId: input.budgetId, transactions: records,
          attachments: (current.attachments ?? []).map((attachment) => ({
            id: `${input.transactionId}:attachment:${attachment.id}`, budgetId: input.budgetId,
            transactionId: input.transactionId, fileName: attachment.fileName, fileSize: attachment.fileSize,
            mimeType: attachment.mimeType, attachedAt, contentHash: attachment.contentHash,
            content: dependencies.decodeBase64(attachment.contentBase64) })) };
      }
      const committed = await replaceHistory({ budgetId: input.budgetId, scheduleId: current.id, expectedSchedule: current,
        replacementSchedule: afterSchedule, expectedTransaction: null, replacementTransaction: transaction });
      return { ...committed, result: { afterSchedule, transaction } };
    },
    async createScheduledTransaction(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const schedule = buildScheduledTransaction(input);
      const committed = await writeSchedule(local, budgetId, schedule.id, schedule);
      return { ...committed, result: await listSchedules(local, input.accountId) };
    },
    async updateScheduledTransaction(budgetId, scheduleId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const existing = (await listSchedules(local, input.accountId)).find(({ id }) => id === scheduleId);
      if (!existing) throw new Error("The local scheduled transaction was not found.");
      const schedule = buildScheduledTransaction(input, { existing });
      const committed = await writeSchedule(local, budgetId, schedule.id, schedule);
      return { ...committed, result: await listSchedules(local, input.accountId) };
    },
    async deleteScheduledTransaction(budgetId, accountId, scheduleId) {
      const local = await dependencies.requireDatabase(budgetId);
      const committed = await writeSchedule(local, budgetId, scheduleId, null);
      return { ...committed, result: await listSchedules(local, accountId) };
    },
    async advanceScheduledTransaction(budgetId, accountId, scheduleId) {
      const local = await dependencies.requireDatabase(budgetId);
      const existing = (await listSchedules(local, accountId)).find(({ id }) => id === scheduleId);
      if (!existing) return committedCommandResult(await listSchedules(local, accountId), [], emptyCommandChange(budgetId));
      const result = advanceScheduledTransaction(existing);
      const committed = await writeSchedule(local, budgetId, scheduleId, result.action === "delete" ? null : result.transaction);
      return { ...committed, result: await listSchedules(local, accountId) };
    },
    async renameScheduledPayeeReferences(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const rewritten = (await local.listEntities<ScheduledTransactionView>("scheduledTransactions"))
        .filter((schedule) => schedule.payeeId === input.payeeId || schedule.payee === input.previousName)
        .map((schedule) => ({ ...schedule, payee: input.nextName, updatedAt: new Date().toISOString() }));
      if (rewritten.length === 0) return committedCommandResult(undefined, [], emptyCommandChange(budgetId));
      const members: LocalBudgetOperationGroup["members"] = rewritten.map((schedule) => ({
        domain: "scheduledTransactions", entityId: schedule.id, operation: "upsert", payload: schedule,
      }));
      const operationGroupId = createRuntimeUuid();
      const operationGroup: LocalBudgetOperationGroup = { members };
      const mutations = members.map((member) => dependencies.createMutation(budgetId, member.domain,
        member.entityId, member.operation, member.payload, operationGroupId, operationGroup));
      await local.mutateBatch(mutations);
      return committedCommandResult(undefined, mutations, persistenceScopeForMutations(budgetId, mutations));
    },
    async reassignScheduledPayeeReferences(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const rewritten = (await local.listEntities<ScheduledTransactionView>("scheduledTransactions"))
        .filter((schedule) => schedule.payeeId === input.sourcePayeeId || schedule.payee === input.sourceName)
        .map((schedule) => ({ ...schedule, payeeId: input.targetPayeeId, payee: input.targetName,
          updatedAt: new Date().toISOString() }));
      if (rewritten.length === 0) return committedCommandResult(undefined, [], emptyCommandChange(budgetId));
      const members: LocalBudgetOperationGroup["members"] = rewritten.map((schedule) => ({
        domain: "scheduledTransactions", entityId: schedule.id, operation: "upsert", payload: schedule,
      }));
      const operationGroupId = createRuntimeUuid();
      const operationGroup: LocalBudgetOperationGroup = { members };
      const mutations = members.map((member) => dependencies.createMutation(budgetId, member.domain,
        member.entityId, member.operation, member.payload, operationGroupId, operationGroup));
      await local.mutateBatch(mutations);
      return committedCommandResult(undefined, mutations, persistenceScopeForMutations(budgetId, mutations));
    },
  };
}
