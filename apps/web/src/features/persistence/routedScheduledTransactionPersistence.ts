import type {
  ScheduledTransactionPersistencePort,
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../accounts/scheduledTransactionPersistencePort";
import { scheduledTransactionToRegisterInput } from "../accounts/scheduledTransactionService";
import { getActiveBudgetIdFromStorage } from "../budget/budgetDataScope";
import { localCalendarDate } from "../dates/localCalendarDate";
import type { AccountRegisterQueryClient } from "./accountRegisterQueryContracts";
import type { KeyValueStoragePort } from "./keyValueStoragePort";

export function createRoutedScheduledTransactionPersistence(options: {
  storage: KeyValueStoragePort;
  queryClient: AccountRegisterQueryClient;
}): ScheduledTransactionPersistencePort {
  function requireActiveBudgetId(): string {
    const budgetId = getActiveBudgetIdFromStorage(options.storage);

    if (!budgetId) {
      throw new Error(
        "Scheduled transactions require an active local-first budget.",
      );
    }

    return budgetId;
  }

  async function withResolvedPayee(
    budgetId: string,
    input: UpsertScheduledTransactionInput,
  ): Promise<UpsertScheduledTransactionInput> {
    if (input.payeeId || input.payee.startsWith("Transfer:")) {
      return input;
    }

    const payees = await options.queryClient.createPayee(
      budgetId,
      input.payee,
    );

    const normalised = input.payee
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();

    const payee = payees.find(
      (candidate) =>
        candidate.name
          .replace(/\s+/g, " ")
          .trim()
          .toLocaleLowerCase() === normalised,
    );

    return payee
      ? { ...input, payeeId: payee.id }
      : input;
  }

  async function listByAccount(
    accountId: string,
  ): Promise<ScheduledTransactionView[]> {
    const budgetId = requireActiveBudgetId();

    return [
      ...await options.queryClient.listScheduledTransactions(
        budgetId,
        accountId,
      ),
    ];
  }

  return {
    listByAccount,

    async dueCountByAccount(accountId) {
      const schedules = await listByAccount(accountId);
      const today = localCalendarDate();

      return schedules.filter(
        ({ nextDueDate }) => nextDueDate <= today,
      ).length;
    },

    async create(input) {
      const budgetId = requireActiveBudgetId();

      return [
        ...await options.queryClient.createScheduledTransaction(
          budgetId,
          await withResolvedPayee(budgetId, input),
        ),
      ];
    },

    async update(input) {
      const budgetId = requireActiveBudgetId();

      return [
        ...await options.queryClient.updateScheduledTransaction(
          budgetId,
          input.id,
          await withResolvedPayee(budgetId, input),
        ),
      ];
    },

    async delete(accountId, scheduledTransactionId) {
      const budgetId = requireActiveBudgetId();

      return [
        ...await options.queryClient.deleteScheduledTransaction(
          budgetId,
          accountId,
          scheduledTransactionId,
        ),
      ];
    },

    async advanceAfterEnter(accountId, scheduledTransactionId) {
      const budgetId = requireActiveBudgetId();

      return [
        ...await options.queryClient.advanceScheduledTransaction(
          budgetId,
          accountId,
          scheduledTransactionId,
        ),
      ];
    },

    toRegisterInput(transaction) {
      return scheduledTransactionToRegisterInput(transaction);
    },

    async renamePayeeReferences(input) {
      const budgetId = requireActiveBudgetId();

      await options.queryClient.renameScheduledPayeeReferences(
        budgetId,
        input,
      );
    },

    async reassignPayeeReferences(input) {
      const budgetId = requireActiveBudgetId();

      await options.queryClient.reassignScheduledPayeeReferences(
        budgetId,
        input,
      );
    },
  };
}
