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
import { committedCommandResult, emptyCommandChange, type CommittedCommandMethods } from "./commandContext";
import { deriveTransactionChangeScope } from "../persistenceChangeImpact";

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
}

/** Final implementation owner for transaction create, update, and delete. */
export function createTransactionCommands(
  dependencies: TransactionCommandDependencies,
): CommittedCommandMethods<ExtractedTransactionCommands> {
  return {
    async addTransaction(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, input.id);
      if (existing) {
        throw new Error(`Transaction ${input.id} already exists and cannot be added again.`);
      }

      const records = await buildNewTransactionRecords(local, input.id, input);
      const writes = transactionWrites(dependencies.createMutation, records);
      const { registerDelta } = await local.writeTransactionBatch(writes, {
        requireAbsentTransactionIds: records.map((record) => record.id),
      });
      return committedCommandResult(undefined, writes.map(({ mutation }) => mutation),
        persistenceScopeForMutations(
          input.budgetId,
          writes.map(({ mutation }) => mutation),
        ), registerDelta,
      );
    },

    async commitTransactionBatch(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const { writes, requireAbsentTransactionIds } = await prepareTransactionBatchWrites(
        dependencies.createMutation,
        local,
        input,
      );
      const { registerDelta } = await local.writeTransactionBatch(writes, {
        requireAbsentTransactionIds,
        verifyWrittenTransactions: input.provenanceAssignments.length > 0,
      });
      const mutations = writes.map(({ mutation }) => mutation);
      return committedCommandResult(undefined, mutations, mutations.length > 0
        ? persistenceScopeForMutations(input.budgetId, mutations)
        : emptyCommandChange(input.budgetId), registerDelta);
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
      const { registerDelta } = await local.writeTransactionBatch(
        writes,
      );
      const mutations = writes.map(({ mutation }) => mutation);
      return committedCommandResult(undefined, mutations, writes.length > 0
        ? deriveTransactionChangeScope({ budgetId: input.budgetId, before: previousRecords, after: records,
            transactionIds: [...previousRecords, ...records].map(({ id }) => id) })
        : emptyCommandChange(input.budgetId), registerDelta);
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
      const writes = transactionWrites(dependencies.createMutation, records);
      const { registerDelta } = await local.writeTransactionBatch(writes);
      return committedCommandResult(undefined, writes.map(({ mutation }) => mutation), deriveTransactionChangeScope({
        budgetId: input.budgetId, before: [existing], after: records,
        transactionIds: [existing, ...records].map(({ id }) => id),
      }), registerDelta);
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
      const mutation = dependencies.createMutation(input.budgetId, "transactions", transactionId, "upsert", record);
      const { registerDelta } = await local.writeTransaction(record, mutation);
      return committedCommandResult(undefined, [mutation], deriveTransactionChangeScope({
        budgetId: input.budgetId, before: [existing], after: [record], transactionIds: [transactionId],
      }), registerDelta);
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
      const writes = transactionWritesAsSingleOperationGroup(dependencies.createMutation, records);
      const { registerDelta } = await local.writeTransactionBatch(
        writes,
        { verifyWrittenTransactions: true },
      );
      return committedCommandResult(undefined, writes.map(({ mutation }) => mutation), records.length > 0
        ? deriveTransactionChangeScope({ budgetId: input.budgetId, before: previousRecords, after: records,
            transactionIds: [...previousRecords, ...records].map(({ id }) => id) })
        : emptyCommandChange(input.budgetId), registerDelta);
    },

    async deleteTransaction(transactionId, input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const existing = await local.getTransaction(input.budgetId, transactionId);

      if (!existing) {
        const mutation = dependencies.createMutation(
          input.budgetId, "transactions", transactionId, "delete", null,
        );
        const { registerDelta } = await local.deleteTransaction(
          transactionId,
          mutation,
        );
        return committedCommandResult(undefined, [mutation], { budgetId: input.budgetId,
          domains: ["transactions", "budget"],
          transactionIds: [transactionId],
        }, registerDelta);
      }

      requireMutableTransaction(existing);
      const counterpart = await findReciprocalTransferCounterpartForDelete(local, existing);
      if (counterpart) requireMutableTransaction(counterpart);

      if (!counterpart) {
        const mutation = dependencies.createMutation(
          input.budgetId, "transactions", transactionId, "delete", {
            accountId: existing.accountId, amount: existing.amount,
            transferAccountId: existing.transferAccountId, transferTransactionId: existing.transferTransactionId,
          },
        );
        const { registerDelta } = await local.deleteTransaction(
          transactionId,
          mutation,
        );
        return committedCommandResult(undefined, [mutation], deriveTransactionChangeScope({
          budgetId: input.budgetId, before: [existing], after: [], transactionIds: [transactionId],
        }), registerDelta);
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
      const deletes = operationGroup.members.map((member) => ({
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
        }));
      const { registerDelta } = await local.deleteTransactionBatch(deletes);
      return committedCommandResult(undefined, deletes.map(({ mutation }) => mutation), deriveTransactionChangeScope({
        budgetId: input.budgetId, before: [existing, counterpart], after: [],
        transactionIds: [existing.id, counterpart.id],
      }), registerDelta);
    },
  };
}
