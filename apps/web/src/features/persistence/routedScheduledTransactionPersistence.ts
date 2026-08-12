import type {
  ScheduledTransactionPersistencePort,
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../accounts/scheduledTransactionPersistencePort";
import { getActiveBudgetIdFromStorage } from "../budget/budgetDataScope";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import type { AccountRegisterQueryClient } from "./accountRegisterQueryContracts";
import { localCalendarDate } from "../dates/localCalendarDate";

export function createRoutedScheduledTransactionPersistence(options: {
  storage: KeyValueStoragePort;
  queryClient: AccountRegisterQueryClient;
  fallback: ScheduledTransactionPersistencePort;
}): ScheduledTransactionPersistencePort {
  async function resolveScheduledTransactionBudgetId(): Promise<string | null> {
    const budgetId = getActiveBudgetIdFromStorage(options.storage);
    if (!budgetId) return null;
    const status = await options.queryClient.getBudgetStatus(budgetId).catch(() => null);
    return status?.capabilities.scheduledTransactions
      ? budgetId
      : null;
  }

  async function withResolvedPayee(
    budgetId: string,
    input: UpsertScheduledTransactionInput,
  ): Promise<UpsertScheduledTransactionInput> {
    if (input.payeeId || input.payee.startsWith("Transfer:")) return input;
    const payees = await options.queryClient.createPayee(budgetId, input.payee);
    const normalised = input.payee.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const payee = payees.find(
      (candidate) =>
        candidate.name.replace(/\s+/g, " ").trim().toLocaleLowerCase() === normalised,
    );
    return payee ? { ...input, payeeId: payee.id } : input;
  }

  async function listByAccount(accountId: string): Promise<ScheduledTransactionView[]> {
    const budgetId = await resolveScheduledTransactionBudgetId();
    if (!budgetId) return options.fallback.listByAccount(accountId);
    return [
      ...await options.queryClient.listScheduledTransactions(budgetId, accountId),
    ];
  }

  return {
    listByAccount,
    async dueCountByAccount(accountId) {
      const schedules = await listByAccount(accountId);
      const today = localCalendarDate();
      return schedules.filter(({ nextDueDate }) => nextDueDate <= today).length;
    },
    async create(input) {
      const budgetId = await resolveScheduledTransactionBudgetId();
      if (!budgetId) return options.fallback.create(input);
      return [
        ...await options.queryClient.createScheduledTransaction(
          budgetId,
          await withResolvedPayee(budgetId, input),
        ),
      ];
    },
    async update(input) {
      const budgetId = await resolveScheduledTransactionBudgetId();
      if (!budgetId) return options.fallback.update(input);
      return [
        ...await options.queryClient.updateScheduledTransaction(
          budgetId,
          input.id,
          await withResolvedPayee(budgetId, input),
        ),
      ];
    },
    async delete(accountId, scheduledTransactionId) {
      const budgetId = await resolveScheduledTransactionBudgetId();
      return budgetId
        ? [...await options.queryClient.deleteScheduledTransaction(
            budgetId, accountId, scheduledTransactionId,
          )]
        : options.fallback.delete(accountId, scheduledTransactionId);
    },
    async advanceAfterEnter(accountId, scheduledTransactionId) {
      const budgetId = await resolveScheduledTransactionBudgetId();
      return budgetId
        ? [...await options.queryClient.advanceScheduledTransaction(
            budgetId, accountId, scheduledTransactionId,
          )]
        : options.fallback.advanceAfterEnter(accountId, scheduledTransactionId);
    },
    toRegisterInput(transaction: ScheduledTransactionView) {
      return options.fallback.toRegisterInput(transaction);
    },
    async renamePayeeReferences(input) {
      const budgetId = await resolveScheduledTransactionBudgetId();
      if (budgetId) {
        await options.queryClient.renameScheduledPayeeReferences(budgetId, input);
      } else {
        await options.fallback.renamePayeeReferences(input);
      }
    },
    async reassignPayeeReferences(input) {
      const budgetId = await resolveScheduledTransactionBudgetId();
      if (budgetId) {
        await options.queryClient.reassignScheduledPayeeReferences(budgetId, input);
      } else {
        await options.fallback.reassignPayeeReferences(input);
      }
    },
  };
}
