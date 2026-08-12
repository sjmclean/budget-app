import {
  createScheduledTransactionEntityRepository,
  projectScheduledTransaction,
  replaceScheduledTransactionEntities,
} from "../../apps/web/src/features/accounts/entities/scheduledTransactionEntity.ts";
import {
  buildScheduledTransaction,
} from "../../apps/web/src/features/accounts/scheduledTransactionLifecycle.ts";
import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../../apps/web/src/features/accounts/scheduledTransactionTypes.ts";
import type {
  KeyValueStoragePort,
} from "../../apps/web/src/features/persistence/keyValueStoragePort.ts";

export function createScheduledTransactionEntityHarness(
  storage: KeyValueStoragePort,
) {
  function listAll(): ScheduledTransactionView[] {
    return createScheduledTransactionEntityRepository(storage)
      .list()
      .map(projectScheduledTransaction);
  }

  return {
    async listByAccount(
      accountId: string,
    ): Promise<ScheduledTransactionView[]> {
      return listAll()
        .filter(
          (transaction) =>
            transaction.accountId === accountId,
        )
        .sort(
          (left, right) =>
            left.nextDueDate.localeCompare(
              right.nextDueDate,
            ) ||
            left.id.localeCompare(right.id),
        );
    },

    async create(
      input: UpsertScheduledTransactionInput,
    ): Promise<ScheduledTransactionView[]> {
      const transaction =
        buildScheduledTransaction(input);

      replaceScheduledTransactionEntities(
        storage,
        [...listAll(), transaction],
      );

      return this.listByAccount(
        input.accountId,
      );
    },

    async reassignPayeeReferences(input: {
      sourcePayeeId: string;
      sourceName: string;
      targetPayeeId: string;
      targetName: string;
    }): Promise<void> {
      const now = new Date().toISOString();

      const transactions = listAll().map(
        (transaction) => {
          if (
            transaction.payeeId !==
              input.sourcePayeeId &&
            transaction.payee !==
              input.sourceName
          ) {
            return transaction;
          }

          return {
            ...transaction,
            payeeId:
              input.targetPayeeId,
            payee:
              input.targetName,
            updatedAt: now,
          };
        },
      );

      replaceScheduledTransactionEntities(
        storage,
        transactions,
      );
    },
  };
}
