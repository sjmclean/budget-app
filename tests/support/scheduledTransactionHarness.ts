import {
  advanceScheduledTransaction,
  buildScheduledTransaction,
} from "../../apps/web/src/features/accounts/scheduledTransactionLifecycle.ts";
import { scheduledTransactionToRegisterInput } from "../../apps/web/src/features/accounts/scheduledTransactionToRegisterInput.ts";
import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../../apps/web/src/features/accounts/scheduledTransactionTypes.ts";

export interface ScheduledTransactionHarness {
  listByAccount(accountId: string): Promise<ScheduledTransactionView[]>;
  create(
    input: UpsertScheduledTransactionInput,
  ): Promise<ScheduledTransactionView[]>;
  update(
    input: UpsertScheduledTransactionInput & { id: string },
  ): Promise<ScheduledTransactionView[]>;
  delete(
    accountId: string,
    scheduledTransactionId: string,
  ): Promise<ScheduledTransactionView[]>;
  advanceAfterEnter(
    accountId: string,
    scheduledTransactionId: string,
  ): Promise<ScheduledTransactionView[]>;
  toRegisterInput(
    transaction: ScheduledTransactionView,
  ): ReturnType<typeof scheduledTransactionToRegisterInput>;
}

export function createScheduledHarness(): ScheduledTransactionHarness {
  let transactions: ScheduledTransactionView[] = [];
  let nextId = 1;

  function listForAccount(accountId: string): ScheduledTransactionView[] {
    return transactions
      .filter((transaction) => transaction.accountId === accountId)
      .sort(compareScheduledTransactions);
  }

  return {
    async listByAccount(accountId) {
      return listForAccount(accountId);
    },

    async create(input) {
      const transaction = buildScheduledTransaction(input, {
        id: `scheduled-test-${nextId++}`,
      });

      transactions = [
        ...transactions,
        transaction,
      ];

      return listForAccount(input.accountId);
    },

    async update(input) {
      const existing = transactions.find(
        (transaction) => transaction.id === input.id,
      );

      if (!existing) {
        throw new Error(
          "The scheduled transaction was not found.",
        );
      }

      const updated = buildScheduledTransaction(input, {
        existing,
      });

      transactions = transactions.map((transaction) =>
        transaction.id === input.id
          ? updated
          : transaction,
      );

      return listForAccount(input.accountId);
    },

    async delete(accountId, scheduledTransactionId) {
      transactions = transactions.filter(
        (transaction) =>
          transaction.id !== scheduledTransactionId,
      );

      return listForAccount(accountId);
    },

    async advanceAfterEnter(accountId, scheduledTransactionId) {
      const existing = transactions.find(
        (transaction) =>
          transaction.id === scheduledTransactionId,
      );

      if (!existing) {
        return listForAccount(accountId);
      }

      const result = advanceScheduledTransaction(existing);

      if (result.action === "delete") {
        transactions = transactions.filter(
          (transaction) =>
            transaction.id !== scheduledTransactionId,
        );
      } else {
        transactions = transactions.map((transaction) =>
          transaction.id === scheduledTransactionId
            ? result.transaction
            : transaction,
        );
      }

      return listForAccount(accountId);
    },

    toRegisterInput(transaction) {
      return scheduledTransactionToRegisterInput(transaction);
    },
  };
}

export async function createSchedule(
  service: ScheduledTransactionHarness,
  overrides: Partial<UpsertScheduledTransactionInput> = {},
) {
  const created = await service.create({
    accountId: "checking",
    nextDueDate: "2026-07-25",
    recurrenceAnchorDate: "2026-07-25",
    frequency: "weekly",
    payee: "Scheduled bill",
    category: "Bills",
    outflow: 10,
    inflow: 0,
    ...overrides,
  });

  const transaction = created.find(
    (item) =>
      item.payee ===
      (overrides.payee ?? "Scheduled bill"),
  );

  if (!transaction) {
    throw new Error(
      "Scheduled transaction was not created",
    );
  }

  return transaction;
}

function compareScheduledTransactions(
  left: ScheduledTransactionView,
  right: ScheduledTransactionView,
): number {
  return (
    left.nextDueDate.localeCompare(right.nextDueDate) ||
    left.id.localeCompare(right.id)
  );
}
