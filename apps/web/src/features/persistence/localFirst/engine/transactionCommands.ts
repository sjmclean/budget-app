import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import type { LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import type { LocalTransactionRecord } from "../registerSchema";
import { persistenceScopeForMutations } from "../mutationEvents";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import {
  buildNewTransactionRecords,
  buildUpdatedTransactionRecords,
  findReciprocalTransferCounterpartForDelete,
  prepareTransactionBatchWrites,
  requireMutableTransaction,
  requireTransferCounterpart,
  transactionWrites,
  transactionWritesAsSingleOperationGroup,
  type CreateTransactionMutation,
} from "./transactionCommandHelpers";

type ExtractedTransactionCommands = Pick<
  LocalBudgetRuntimeClient,
  | "addTransaction"
  | "commitTransactionBatch"
  | "moveTransactions"
  | "updateTransaction"
  | "toggleTransactionCleared"
  | "setTransactionsCleared"
  | "deleteTransaction"
>;

export interface TransactionCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateTransactionMutation;
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

/** Final implementation owner for transaction create, update, and delete. */
export function createTransactionCommands(
  dependencies: TransactionCommandDependencies,
): ExtractedTransactionCommands {
  return {
    async addTransaction(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, input.id);
      if (existing) {
        throw new Error(`Transaction ${input.id} already exists and cannot be added again.`);
      }

      const records = await buildNewTransactionRecords(local, input.id, input);
      const writes = transactionWrites(dependencies.createMutation, records);
      await local.writeTransactionBatch(writes, {
        requireAbsentTransactionIds: records.map((record) => record.id),
      });
      dependencies.recordCommittedChange(
        input.budgetId,
        persistenceScopeForMutations(
          input.budgetId,
          writes.map(({ mutation }) => mutation),
        ),
      );
    },

    async commitTransactionBatch(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const { writes, requireAbsentTransactionIds } = await prepareTransactionBatchWrites(
        dependencies.createMutation,
        local,
        input,
      );
      await local.writeTransactionBatch(writes, {
        requireAbsentTransactionIds,
        verifyWrittenTransactions: input.provenanceAssignments.length > 0,
      });
      if (writes.length > 0) {
        dependencies.recordCommittedChange(
          input.budgetId,
          persistenceScopeForMutations(input.budgetId, writes.map(({ mutation }) => mutation)),
        );
      }
    },

    async moveTransactions(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const records: LocalTransactionRecord[] = [];
      const previousRecords: LocalTransactionRecord[] = [];
      for (const transactionId of input.transactionIds) {
        const existing = await local.getTransaction(input.budgetId, transactionId);
        if (!existing || existing.accountId !== input.sourceAccountId) continue;
        previousRecords.push(existing);
        requireMutableTransaction(existing);
        const counterpart = await requireTransferCounterpart(local, existing);
        if (counterpart) {
          requireMutableTransaction(counterpart);
          previousRecords.push(counterpart);
        }
        if (counterpart && input.targetAccountId === existing.transferAccountId) {
          throw new Error("This transfer cannot be moved to the account containing its other side.");
        }
        const updatedAt = new Date().toISOString();
        const record: LocalTransactionRecord = { ...existing, accountId: input.targetAccountId, updatedAt };
        if (!counterpart) {
          records.push(record);
          continue;
        }
        const counterpartRecord: LocalTransactionRecord = { ...counterpart, transferAccountId: input.targetAccountId, updatedAt };
        records.push(record, counterpartRecord);
      }
      const writes = transactionWritesAsSingleOperationGroup(dependencies.createMutation, records);
      await local.writeTransactionBatch(
        writes,
      );
      if (writes.length > 0) {
        dependencies.recordTransactionsCommitted(input.budgetId, previousRecords, records);
      }
    },

    async updateTransaction(transactionId, input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, transactionId);
      if (!existing) throw new Error("The local transaction was not found.");

      const records = await buildUpdatedTransactionRecords(
        local,
        transactionId,
        input,
        existing,
      );
      await local.writeTransactionBatch(transactionWrites(dependencies.createMutation, records));
      dependencies.recordTransactionsCommitted(input.budgetId, [existing], records);
    },

    async toggleTransactionCleared(transactionId, input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, transactionId);
      if (!existing) throw new Error("The local transaction was not found.");
      requireMutableTransaction(existing);
      const record: LocalTransactionRecord = {
        ...existing,
        clearedStatus: existing.clearedStatus === "uncleared" ? "cleared" : "uncleared",
        updatedAt: new Date().toISOString(),
      };
      await local.writeTransaction(
        record,
        dependencies.createMutation(input.budgetId, "transactions", transactionId, "upsert", record),
      );
      dependencies.recordTransactionsCommitted(input.budgetId, [existing], [record]);
    },

    async setTransactionsCleared(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const records: LocalTransactionRecord[] = [];
      const previousRecords: LocalTransactionRecord[] = [];
      for (const transactionId of [...new Set(input.transactionIds)]) {
        const existing = await local.getTransaction(input.budgetId, transactionId);
        if (!existing) throw new Error(`Transaction ${transactionId} was not found.`);
        requireMutableTransaction(existing);
        previousRecords.push(existing);
        records.push({
          ...existing,
          clearedStatus: input.cleared ? "cleared" : "uncleared",
          updatedAt: new Date().toISOString(),
        });
      }
      await local.writeTransactionBatch(
        transactionWritesAsSingleOperationGroup(dependencies.createMutation, records),
        { verifyWrittenTransactions: true },
      );
      if (records.length > 0) {
        dependencies.recordTransactionsCommitted(input.budgetId, previousRecords, records);
      }
    },

    async deleteTransaction(transactionId, input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, transactionId);

      if (!existing) {
        await local.deleteTransaction(
          transactionId,
          dependencies.createMutation(
            input.budgetId,
            "transactions",
            transactionId,
            "delete",
            null,
          ),
        );
        dependencies.recordCommittedChange(input.budgetId, {
          domains: ["transactions", "budget"],
          transactionIds: [transactionId],
        });
        return;
      }

      requireMutableTransaction(existing);
      const counterpart = await findReciprocalTransferCounterpartForDelete(local, existing);
      if (counterpart) requireMutableTransaction(counterpart);

      if (!counterpart) {
        await local.deleteTransaction(
          transactionId,
          dependencies.createMutation(
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
        dependencies.recordTransactionsCommitted(input.budgetId, [existing], [], [transactionId]);
        return;
      }

      const operationGroupId = createRuntimeUuid();
      const operationGroup: LocalBudgetOperationGroup = {
        members: [existing, counterpart].map((transaction) => ({
          domain: "transactions",
          entityId: transaction.id,
          operation: "delete",
          payload: {
            accountId: transaction.accountId,
            amount: transaction.amount,
            transferAccountId: transaction.transferAccountId,
            transferTransactionId: transaction.transferTransactionId,
          },
        })),
      };
      await local.deleteTransactionBatch(
        operationGroup.members.map((member) => ({
          transactionId: member.entityId,
          mutation: dependencies.createMutation(
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
      dependencies.recordTransactionsCommitted(
        input.budgetId,
        [existing, counterpart],
        [],
        [existing.id, counterpart.id],
      );
    },
  };
}
