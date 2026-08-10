import type {
  ScheduledTransactionPersistencePort,
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../accounts/scheduledTransactionPersistencePort";
import { getActiveBudgetIdFromStorage } from "../budget/budgetDataScope";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import type { HostedAccountRegisterQueryClient } from "./hostedAccountRegisterQueryClient";
import { localCalendarDate } from "../dates/localCalendarDate";

export function createHostedScheduledTransactionPersistence(options: {
  storage: KeyValueStoragePort;
  hosted: HostedAccountRegisterQueryClient;
  fallback: ScheduledTransactionPersistencePort;
}): ScheduledTransactionPersistencePort {
  const migrationKey = (budgetId: string, accountId: string) =>
    `budget-app.hosted-schedule-migration.v1.${budgetId}.${accountId}`;
  async function hostedBudgetId(): Promise<string | null> {
    const budgetId = getActiveBudgetIdFromStorage(options.storage);
    if (!budgetId) return null;
    const status = await options.hosted.getBudgetStatus(budgetId).catch(() => null);
    return (
      status?.capabilities.scheduledTransactions ??
      status?.capabilities.accountRegisters
    )
      ? budgetId
      : null;
  }

  async function withResolvedPayee(
    budgetId: string,
    input: UpsertScheduledTransactionInput,
  ): Promise<UpsertScheduledTransactionInput> {
    if (input.payeeId || input.payee.startsWith("Transfer:")) return input;
    const payees = await options.hosted.createPayee(budgetId, input.payee);
    const normalised = input.payee.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const payee = payees.find(
      (candidate) =>
        candidate.name.replace(/\s+/g, " ").trim().toLocaleLowerCase() === normalised,
    );
    return payee ? { ...input, payeeId: payee.id } : input;
  }

  async function listByAccount(accountId: string): Promise<ScheduledTransactionView[]> {
    const budgetId = await hostedBudgetId();
    if (!budgetId) return options.fallback.listByAccount(accountId);
    let hostedSchedules = [
      ...await options.hosted.listScheduledTransactions(budgetId, accountId),
    ];
    const key = migrationKey(budgetId, accountId);
    if (options.storage.getItem(key) !== "complete") {
      const localSchedules = await options.fallback.listByAccount(accountId);
      if (hostedSchedules.length === 0 && localSchedules.length > 0) {
        for (const schedule of localSchedules) {
          hostedSchedules = [
            ...await options.hosted.createScheduledTransaction(
              budgetId,
              await withResolvedPayee(budgetId, schedule),
            ),
          ];
        }
      }
      options.storage.setItem(key, "complete");
      await options.storage.flush?.();
    }
    return hostedSchedules;
  }

  return {
    listByAccount,
    async dueCountByAccount(accountId) {
      const schedules = await listByAccount(accountId);
      const today = localCalendarDate();
      return schedules.filter(({ nextDueDate }) => nextDueDate <= today).length;
    },
    async create(input) {
      const budgetId = await hostedBudgetId();
      if (!budgetId) return options.fallback.create(input);
      return [
        ...await options.hosted.createScheduledTransaction(
          budgetId,
          await withResolvedPayee(budgetId, input),
        ),
      ];
    },
    async update(input) {
      const budgetId = await hostedBudgetId();
      if (!budgetId) return options.fallback.update(input);
      return [
        ...await options.hosted.updateScheduledTransaction(
          budgetId,
          input.id,
          await withResolvedPayee(budgetId, input),
        ),
      ];
    },
    async delete(accountId, scheduledTransactionId) {
      const budgetId = await hostedBudgetId();
      return budgetId
        ? [...await options.hosted.deleteScheduledTransaction(
            budgetId, accountId, scheduledTransactionId,
          )]
        : options.fallback.delete(accountId, scheduledTransactionId);
    },
    async advanceAfterEnter(accountId, scheduledTransactionId) {
      const budgetId = await hostedBudgetId();
      return budgetId
        ? [...await options.hosted.advanceScheduledTransaction(
            budgetId, accountId, scheduledTransactionId,
          )]
        : options.fallback.advanceAfterEnter(accountId, scheduledTransactionId);
    },
    toRegisterInput(transaction: ScheduledTransactionView) {
      return options.fallback.toRegisterInput(transaction);
    },
    async renamePayeeReferences(input) {
      const budgetId = await hostedBudgetId();
      if (budgetId) {
        await options.hosted.renameScheduledPayeeReferences(budgetId, input);
      } else {
        await options.fallback.renamePayeeReferences(input);
      }
    },
    async reassignPayeeReferences(input) {
      const budgetId = await hostedBudgetId();
      if (budgetId) {
        await options.hosted.reassignScheduledPayeeReferences(budgetId, input);
      } else {
        await options.fallback.reassignPayeeReferences(input);
      }
    },
  };
}
