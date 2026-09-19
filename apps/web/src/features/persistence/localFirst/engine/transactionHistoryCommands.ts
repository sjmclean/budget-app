import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";
import { deriveTransactionChangeScope, mergePersistenceChangeScopes } from "../persistenceChangeImpact";
import type {
  LocalPayeeRecord,
  LocalTransactionAttachmentMutationPayload,
  LocalTransactionAttachmentRecord,
  LocalTransactionRecord,
} from "../registerSchema";
import { prepareTransactionBatchWrites, type CreateTransactionMutation } from "./transactionCommandHelpers";
import { committedCommandResult, emptyCommandChange, type CommittedCommandMethods } from "./commandContext";

type HistoryCommands = Pick<LocalBudgetRuntimeClient,
  | "restoreTransactionHistorySnapshot" | "deleteTransactionHistorySnapshot"
  | "replaceTransactionHistorySnapshot" | "commitImportBatch"
  | "commitImportBatchWithHistory" | "replaceImportHistorySnapshot"
>;

export interface TransactionHistoryCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateTransactionMutation;
  readonly encodeBase64: (bytes: Uint8Array) => string;
}

function transactionScope(budgetId: string, before: readonly LocalTransactionRecord[], after: readonly LocalTransactionRecord[] = []) {
  return deriveTransactionChangeScope({ budgetId, before, after,
    transactionIds: [...before, ...after].map(({ id }) => id) });
}

function attachmentMetadata<T extends { readonly content: Uint8Array }>(attachment: T): Omit<T, "content"> {
  const { content: _content, ...metadata } = attachment;
  return metadata;
}

function historyMembers(snapshot: Parameters<HistoryCommands["restoreTransactionHistorySnapshot"]>[0], operation: "upsert" | "delete", encodeBase64: (bytes: Uint8Array) => string): LocalBudgetOperationGroup["members"] {
  return [
    ...snapshot.transactions.map((transaction) => ({ domain: "transactions" as const, entityId: transaction.id,
      operation, payload: operation === "upsert" ? transaction : { accountId: transaction.accountId,
        amount: transaction.amount, transferAccountId: transaction.transferAccountId,
        transferTransactionId: transaction.transferTransactionId } })),
    ...snapshot.attachments.map((attachment) => ({ domain: "transactions" as const,
      entityId: `attachment:${attachment.id}`, operation,
      payload: operation === "upsert" ? { kind: "transaction-attachment-upsert" as const,
        attachment: attachmentMetadata(attachment), contentBase64: encodeBase64(attachment.content) }
        : { kind: "transaction-attachment-delete" as const, attachment: attachmentMetadata(attachment) } })),
  ];
}

function groupedMutations(dependencies: TransactionHistoryCommandDependencies, budgetId: string,
  members: LocalBudgetOperationGroup["members"]): LocalBudgetMutation[] {
  const operationGroupId = createRuntimeUuid();
  const operationGroup: LocalBudgetOperationGroup = { members };
  return members.map((member) => dependencies.createMutation(budgetId, member.domain, member.entityId,
    member.operation, member.payload, operationGroupId, operationGroup));
}

function payeeRecords(budgetId: string, creations: Parameters<HistoryCommands["commitImportBatch"]>[0]["payeeCreations"]): LocalPayeeRecord[] {
  return creations.map((creation) => {
    const now = new Date().toISOString();
    const name = creation.name.replace(/\s+/g, " ").trim();
    if (!creation.id.trim() || !name) throw new Error("A staged import payee requires both an ID and a name.");
    return { id: creation.id, budgetId, name, note: "", archived: false, createdAt: now, updatedAt: now };
  });
}

async function prepareImport(dependencies: TransactionHistoryCommandDependencies, local: LocalBudgetDatabaseClient,
  input: Parameters<HistoryCommands["commitImportBatch"]>[0]) {
  const prepared = await prepareTransactionBatchWrites(dependencies.createMutation, local, input);
  const payees = payeeRecords(input.budgetId, input.payeeCreations);
  const payeeMutations = payees.map((payee) => dependencies.createMutation(input.budgetId, "payees", payee.id, "upsert", payee));
  const attachmentWrites = (input.attachmentCreations ?? []).map((creation) => {
    const attachment: LocalTransactionAttachmentRecord = {
      ...creation.attachment,
      budgetId: input.budgetId,
      transactionId: creation.transactionId,
    };
    const payload: LocalTransactionAttachmentMutationPayload = {
      kind: "transaction-attachment-upsert",
      attachment,
      contentBase64: dependencies.encodeBase64(creation.content),
    };
    return {
      attachment,
      content: Uint8Array.from(creation.content),
      mutation: dependencies.createMutation(
        input.budgetId,
        "transactions",
        `attachment:${attachment.id}`,
        "upsert",
        payload,
      ),
    };
  });
  const mutations = [
    ...prepared.writes.map(({ mutation }) => mutation),
    ...payeeMutations,
    ...attachmentWrites.map(({ mutation }) => mutation),
  ];
  return { writes: prepared.writes, payeeWrites: payees.map((payee, index) => ({ payee, mutation: payeeMutations[index]! })),
    attachmentWrites, mutations, requireAbsentTransactionIds: prepared.requireAbsentTransactionIds };
}

function importChangeScope(budgetId: string, mutations: readonly LocalBudgetMutation[],
  attachmentWrites: readonly { readonly attachment: LocalTransactionAttachmentRecord }[]): PersistenceChangeScope {
  if (mutations.length === 0) return emptyCommandChange(budgetId);
  const committed = persistenceScopeForMutations(budgetId, mutations);
  if (attachmentWrites.length === 0) return committed;
  return mergePersistenceChangeScopes(budgetId, committed, {
    budgetId,
    domains: ["transactions", "attachments"],
    transactionIds: attachmentWrites.map(({ attachment }) => attachment.transactionId),
  });
}

export function createTransactionHistoryCommands(dependencies: TransactionHistoryCommandDependencies): CommittedCommandMethods<HistoryCommands> {
  return {
    async restoreTransactionHistorySnapshot(snapshot) {
      const local = await dependencies.requireDatabase(snapshot.budgetId);
      const members = historyMembers(snapshot, "upsert", dependencies.encodeBase64);
      const mutations = groupedMutations(dependencies, snapshot.budgetId, members);
      await local.restoreTransactionHistorySnapshot(snapshot, mutations);
      return committedCommandResult(undefined, mutations, transactionScope(snapshot.budgetId, [], snapshot.transactions));
    },
    async deleteTransactionHistorySnapshot(snapshot) {
      const local = await dependencies.requireDatabase(snapshot.budgetId);
      const members = historyMembers(snapshot, "delete", dependencies.encodeBase64);
      const mutations = groupedMutations(dependencies, snapshot.budgetId, members);
      await local.deleteTransactionHistorySnapshot(snapshot, mutations);
      return committedCommandResult(undefined, mutations, transactionScope(snapshot.budgetId, snapshot.transactions));
    },
    async replaceTransactionHistorySnapshot({ expected, replacement }) {
      if (expected.budgetId !== replacement.budgetId) throw new Error("Transaction history replacement cannot cross budgets.");
      const local = await dependencies.requireDatabase(expected.budgetId);
      const nextTransactionIds = new Set(replacement.transactions.map(({ id }) => id));
      const nextAttachmentIds = new Set(replacement.attachments.map(({ id }) => id));
      const deleted = { ...expected, transactions: expected.transactions.filter(({ id }) => !nextTransactionIds.has(id)),
        attachments: expected.attachments.filter(({ id }) => !nextAttachmentIds.has(id)) };
      const members = [...historyMembers(deleted, "delete", dependencies.encodeBase64),
        ...historyMembers(replacement, "upsert", dependencies.encodeBase64)];
      const mutations = groupedMutations(dependencies, expected.budgetId, members);
      await local.replaceTransactionHistorySnapshot(expected, replacement, mutations);
      return committedCommandResult(undefined, mutations,
        transactionScope(expected.budgetId, expected.transactions, replacement.transactions));
    },
    async commitImportBatch(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const prepared = await prepareImport(dependencies, local, input);
      await local.writeImportBatch(prepared.payeeWrites, prepared.writes,
        { requireAbsentTransactionIds: prepared.requireAbsentTransactionIds, verifyWrittenTransactions: true },
        prepared.attachmentWrites);
      return committedCommandResult(undefined, prepared.mutations,
        importChangeScope(input.budgetId, prepared.mutations, prepared.attachmentWrites));
    },
    async commitImportBatchWithHistory(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const prepared = await prepareImport(dependencies, local, input);
      const transactionIds = [...new Set([...input.additions.map(({ id }) => id), ...input.updates.map(({ id }) => id),
        ...input.provenanceAssignments.map(({ transactionId }) => transactionId),
        ...prepared.attachmentWrites.map(({ attachment }) => attachment.transactionId)])].sort();
      const payeeIds = [...new Set(input.payeeCreations.map(({ id }) => id))].sort();
      if (transactionIds.length === 0 && payeeIds.length === 0 && prepared.attachmentWrites.length === 0) {
        throw new Error("An import history command requires at least one persisted object.");
      }
      const snapshots = await local.writeImportBatchWithHistory(prepared.payeeWrites, prepared.writes,
        { requireAbsentTransactionIds: prepared.requireAbsentTransactionIds, verifyWrittenTransactions: true,
          historyTransactionIds: transactionIds, historyPayeeIds: payeeIds }, prepared.attachmentWrites);
      return committedCommandResult(snapshots, prepared.mutations,
        importChangeScope(input.budgetId, prepared.mutations, prepared.attachmentWrites));
    },
    async replaceImportHistorySnapshot({ expected, replacement }) {
      if (expected.budgetId !== replacement.budgetId) throw new Error("Import history replacement cannot cross budgets.");
      const local = await dependencies.requireDatabase(expected.budgetId);
      const nextTransactionIds = new Set(replacement.transactions.transactions.map(({ id }) => id));
      const nextAttachmentIds = new Set(replacement.transactions.attachments.map(({ id }) => id));
      const deletedTransactions = { ...expected.transactions,
        transactions: expected.transactions.transactions.filter(({ id }) => !nextTransactionIds.has(id)),
        attachments: expected.transactions.attachments.filter(({ id }) => !nextAttachmentIds.has(id)) };
      const nextPayeeIds = new Set(replacement.payees.map(({ id }) => id));
      const members: LocalBudgetOperationGroup["members"] = [
        ...historyMembers(deletedTransactions, "delete", dependencies.encodeBase64),
        ...historyMembers(replacement.transactions, "upsert", dependencies.encodeBase64),
        ...expected.payees.filter(({ id }) => !nextPayeeIds.has(id)).map((payee) => ({ domain: "payees" as const,
          entityId: payee.id, operation: "delete" as const, payload: payee })),
        ...replacement.payees.map((payee) => ({ domain: "payees" as const, entityId: payee.id,
          operation: "upsert" as const, payload: payee })),
      ];
      const mutations = groupedMutations(dependencies, expected.budgetId, members);
      await local.replaceImportHistorySnapshot(expected, replacement, mutations);
      return committedCommandResult(undefined, mutations, mergePersistenceChangeScopes(expected.budgetId,
        transactionScope(expected.budgetId, expected.transactions.transactions, replacement.transactions.transactions),
        persistenceScopeForMutations(expected.budgetId, mutations)));
    },
  };
}
