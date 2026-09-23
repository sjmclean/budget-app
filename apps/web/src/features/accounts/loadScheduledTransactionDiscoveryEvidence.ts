import { getBudgetPersistenceProvider } from "../persistence";
import { ensureActiveBudgetPersistenceReady } from "../persistence/budgetDatabaseLifecycle";
import {
  discoverScheduledTransactions,
  discoveryRecordFromAccountTransactionRow,
  discoveryRecordFromRegisterTransaction,
  scheduledTransactionDiscoveryStartDate,
  type ScheduledTransactionSuggestion,
} from "./scheduledTransactionDiscovery";
import type { ScheduledTransactionView } from "./scheduledTransactionTypes";

const DISCOVERY_PAGE_SIZE = 250;

export async function loadScheduledTransactionSuggestions(input: {
  budgetId: string | null;
  accountId: string;
  asOfDate: string;
  existingSchedules: readonly ScheduledTransactionView[];
  ignoredFingerprints?: ReadonlySet<string>;
}): Promise<ScheduledTransactionSuggestion[]> {
  const provider = getBudgetPersistenceProvider();
  const startDate = scheduledTransactionDiscoveryStartDate(input.asOfDate);

  if (input.budgetId && provider.accountRegisterQueries) {
    await ensureActiveBudgetPersistenceReady(input.budgetId);
    const rows = [];
    let before: { date: string; id: string } | undefined;

    for (;;) {
      const page = await provider.accountRegisterQueries.queryLocalTransactions({
        budgetId: input.budgetId,
        accountId: input.accountId,
        limit: DISCOVERY_PAGE_SIZE,
        before,
        dateRange: {
          startDate,
          endDate: input.asOfDate,
        },
        sort: {
          column: "date",
          direction: "descending",
        },
      });

      rows.push(...page.rows);
      if (!page.hasMore || !page.nextCursor) break;
      before = page.nextCursor;
    }

    return discoverScheduledTransactions({
      transactions: rows.map(discoveryRecordFromAccountTransactionRow),
      existingSchedules: input.existingSchedules,
      asOfDate: input.asOfDate,
      ignoredFingerprints: input.ignoredFingerprints,
    });
  }

  const register = await provider.accountRegisters.getAccountRegisterView({
    accountId: input.accountId,
  });

  return discoverScheduledTransactions({
    transactions: register.transactions
      .filter((transaction) => transaction.date >= startDate && transaction.date <= input.asOfDate)
      .map(discoveryRecordFromRegisterTransaction),
    existingSchedules: input.existingSchedules,
    asOfDate: input.asOfDate,
    ignoredFingerprints: input.ignoredFingerprints,
  });
}
