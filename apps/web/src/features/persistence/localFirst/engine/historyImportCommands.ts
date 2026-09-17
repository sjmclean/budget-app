import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";
import type {
  LocalPayeeRecord,
  LocalTransactionRecord,
} from "../registerSchema";
import { prepareTransactionBatchWrites } from "./transactionCommandHelpers";

type HistoryImportCommands = Pick<
  LocalBudgetRuntimeClient,
  | "restoreTransactionHistorySnapshot"
  | "deleteTransactionHistorySnapshot"
  | "replaceTransactionHistorySnapshot"
  | "commitImportBatch"
  | "commitImportBatchWithHistory"
  | "replaceImportHistorySnapshot"
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

export interface HistoryImportCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
  readonly recordCommittedChange: (
    budgetId: string,
    change: Omit<PersistenceChangeScope, "budgetId">,
  ) => void;
  readonly recordTransactionsCommitted: (
    budgetId: string,
    before: readonly LocalTransactionRecord[],
    after?: readonly LocalTransactionRecord[],
    transactionIds?: readonly string[],
  ) => void;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** Final implementation owner for transaction/import history commands. */
export function createHistoryImportCommands(
  dependencies: HistoryImportCommandDependencies,
): HistoryImportCommands {
  return {
    async restoreTransactionHistorySnapshot(snapshot) {
      const local = await dependencies.requireDatabase(snapshot.budgetId);
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
        members.map((member) => dependencies.createMutation(
          snapshot.budgetId,
          member.domain,
          member.entityId,
          member.operation,
          member.payload,
          operationGroupId,
          group,
        )),
      );
      dependencies.recordTransactionsCommitted(snapshot.budgetId, [], snapshot.transactions);
    },

    async deleteTransactionHistorySnapshot(snapshot) {
      const local = await dependencies.requireDatabase(snapshot.budgetId);
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
        members.map((member) => dependencies.createMutation(
          snapshot.budgetId,
          member.domain,
          member.entityId,
          member.operation,
          member.payload,
          operationGroupId,
          group,
        )),
      );
      dependencies.recordTransactionsCommitted(snapshot.budgetId, snapshot.transactions);
    },

    async replaceTransactionHistorySnapshot({ expected, replacement }) {
      if (expected.budgetId !== replacement.budgetId) {
        throw new Error("Transaction history replacement cannot cross budgets.");
      }
      const local = await dependencies.requireDatabase(expected.budgetId);
      const nextTransactionIds = new Set(replacement.transactions.map(({ id }) => id));
      const nextAttachmentIds = new Set(replacement.attachments.map(({ id }) => id));
      const members: LocalBudgetOperationGroup["members"] = [
        ...expected.transactions.filter(({ id }) => !nextTransactionIds.has(id)).map((transaction) => ({
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
        ...expected.attachments.filter(({ id }) => !nextAttachmentIds.has(id)).map((attachment) => ({
          domain: "transactions" as const,
          entityId: `attachment:${attachment.id}`,
          operation: "delete" as const,
          payload: {
            kind: "transaction-attachment-delete" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
          },
        })),
        ...replacement.transactions.map((transaction) => ({
          domain: "transactions" as const,
          entityId: transaction.id,
          operation: "upsert" as const,
          payload: transaction,
        })),
        ...replacement.attachments.map((attachment) => ({
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
      const operationGroupId = createRuntimeUuid();
      const group: LocalBudgetOperationGroup = { members };
      await local.replaceTransactionHistorySnapshot(
        expected,
        replacement,
        members.map((member) => dependencies.createMutation(
          expected.budgetId,
          member.domain,
          member.entityId,
          member.operation,
          member.payload,
          operationGroupId,
          group,
        )),
      );
      dependencies.recordTransactionsCommitted(
        expected.budgetId,
        expected.transactions,
        replacement.transactions,
      );
    },

    async commitImportBatch(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const { writes, requireAbsentTransactionIds } = await prepareTransactionBatchWrites(
        dependencies.createMutation,
        local,
        input,
      );
      const payeeWrites = input.payeeCreations.map((creation) => {
        const now = new Date().toISOString();
        const name = creation.name.replace(/\s+/g, " ").trim();
        if (!creation.id.trim() || !name) {
          throw new Error("A staged import payee requires both an ID and a name.");
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
          mutation: dependencies.createMutation(
            input.budgetId,
            "payees",
            payee.id,
            "upsert",
            payee,
          ),
        };
      });
      await local.writeImportBatch(payeeWrites, writes, {
        requireAbsentTransactionIds,
        verifyWrittenTransactions: true,
      });
      if (payeeWrites.length > 0 || writes.length > 0) {
        dependencies.recordCommittedChange(
          input.budgetId,
          persistenceScopeForMutations(
            input.budgetId,
            [
              ...writes.map(({ mutation }) => mutation),
              ...payeeWrites.map(({ mutation }) => mutation),
            ],
          ),
        );
      }
    },

    async commitImportBatchWithHistory(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const { writes, requireAbsentTransactionIds } = await prepareTransactionBatchWrites(
        dependencies.createMutation,
        local,
        input,
      );
      const payeeWrites = input.payeeCreations.map((creation) => {
        const now = new Date().toISOString();
        const name = creation.name.replace(/\s+/g, " ").trim();
        if (!creation.id.trim() || !name) {
          throw new Error("A staged import payee requires both an ID and a name.");
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
          mutation: dependencies.createMutation(
            input.budgetId,
            "payees",
            payee.id,
            "upsert",
            payee,
          ),
        };
      });
      const transactionIds = [...new Set([
        ...input.additions.map(({ id }) => id),
        ...input.updates.map(({ id }) => id),
        ...input.provenanceAssignments.map(({ transactionId }) => transactionId),
      ])].sort();
      const payeeIds = [...new Set(input.payeeCreations.map(({ id }) => id))].sort();
      if (transactionIds.length === 0 && payeeIds.length === 0) {
        throw new Error("An import history command requires at least one persisted object.");
      }
      const snapshots = await local.writeImportBatchWithHistory(payeeWrites, writes, {
        requireAbsentTransactionIds,
        verifyWrittenTransactions: true,
        historyTransactionIds: transactionIds,
        historyPayeeIds: payeeIds,
      });
      dependencies.recordCommittedChange(
        input.budgetId,
        persistenceScopeForMutations(
          input.budgetId,
          [
            ...writes.map(({ mutation }) => mutation),
            ...payeeWrites.map(({ mutation }) => mutation),
          ],
        ),
      );
      return snapshots;
    },

    async replaceImportHistorySnapshot({ expected, replacement }) {
      if (expected.budgetId !== replacement.budgetId) {
        throw new Error("Import history replacement cannot cross budgets.");
      }
      const local = await dependencies.requireDatabase(expected.budgetId);
      const nextTransactionIds = new Set(
        replacement.transactions.transactions.map(({ id }) => id),
      );
      const nextAttachmentIds = new Set(
        replacement.transactions.attachments.map(({ id }) => id),
      );
      const nextPayeeIds = new Set(replacement.payees.map(({ id }) => id));
      const members: LocalBudgetOperationGroup["members"] = [
        ...expected.transactions.transactions
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
        ...expected.transactions.attachments
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
        ...replacement.transactions.transactions.map((transaction) => ({
          domain: "transactions" as const,
          entityId: transaction.id,
          operation: "upsert" as const,
          payload: transaction,
        })),
        ...replacement.transactions.attachments.map((attachment) => ({
          domain: "transactions" as const,
          entityId: `attachment:${attachment.id}`,
          operation: "upsert" as const,
          payload: {
            kind: "transaction-attachment-upsert" as const,
            attachment: (({ content: _content, ...metadata }) => metadata)(attachment),
            contentBase64: encodeBase64(attachment.content),
          },
        })),
        ...expected.payees
          .filter(({ id }) => !nextPayeeIds.has(id))
          .map((payee) => ({
            domain: "payees" as const,
            entityId: payee.id,
            operation: "delete" as const,
            payload: payee,
          })),
        ...replacement.payees.map((payee) => ({
          domain: "payees" as const,
          entityId: payee.id,
          operation: "upsert" as const,
          payload: payee,
        })),
      ];
      const operationGroupId = createRuntimeUuid();
      const group: LocalBudgetOperationGroup = { members };
      await local.replaceImportHistorySnapshot(
        expected,
        replacement,
        members.map((member) => dependencies.createMutation(
          expected.budgetId,
          member.domain,
          member.entityId,
          member.operation,
          member.payload,
          operationGroupId,
          group,
        )),
      );
      dependencies.recordTransactionsCommitted(
        expected.budgetId,
        expected.transactions.transactions,
        replacement.transactions.transactions,
      );
    },
  };
}
