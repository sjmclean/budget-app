import type { AccountRegisterView, RegisterTransactionView } from "../../../features/accounts/accountRegisterTypes";
import type { SidebarAccount } from "../../../features/accounts/accountService";
import type { BudgetMonthView } from "../../../features/budget/budgetViewTypes";
import { isUncategorisedRegisterTransaction } from "../../../features/accounts/registerUncategorised";
import { buildFinancialSummary } from "./financialSummaryService";

export interface NetWorthPoint {
  month: string;
  label: string;
  value: number;
}

export interface MonthlySnapshot {
  income: number;
  expenses: number;
  savings: number;
  readyToAssign: number;
}

export interface AttentionSummary {
  overspentCategories: number;
  uncategorisedTransactions: number;
}

export interface FinancialOverviewSummary {
  month: string;
  monthLabel: string;
  netWorth: number;
  netWorthChangeThisMonth: number;
  netWorthChangePeriod: number;
  netWorthTrend: NetWorthPoint[];
  monthlySnapshot: MonthlySnapshot;
  attention: AttentionSummary;
}

export function buildFinancialOverviewSummary(input: {
  accounts: SidebarAccount[];
  registers: AccountRegisterView[];
  budgetView: BudgetMonthView | null;
  month: string;
  monthsToShow?: number;
}): FinancialOverviewSummary {
  const monthsToShow = input.monthsToShow ?? 12;
  const trendMonths = buildMonthWindow(input.month, monthsToShow);
  const transactions = input.registers.flatMap((register) =>
    register.transactions.map((transaction) => ({
      ...transaction,
      accountId: register.accountId,
    })),
  );
  const netWorthTrend = trendMonths.map((month) => ({
    month,
    label: formatShortMonth(month),
    value: calculateNetWorthAtMonthEnd(input.accounts, transactions, month),
  }));
  const netWorth = netWorthTrend.at(-1)?.value ?? 0;
  const previousNetWorth = netWorthTrend.at(-2)?.value ?? netWorth;
  const firstNetWorth = netWorthTrend.at(0)?.value ?? netWorth;
  const currentMonthTransactions = transactions.filter((transaction) => isTransactionInMonth(transaction, input.month));
  const financialSummary = buildFinancialSummary(currentMonthTransactions);

  return {
    month: input.month,
    monthLabel: formatLongMonth(input.month),
    netWorth,
    netWorthChangeThisMonth: netWorth - previousNetWorth,
    netWorthChangePeriod: netWorth - firstNetWorth,
    netWorthTrend,
    monthlySnapshot: {
      income: financialSummary.income,
      expenses: financialSummary.expenses,
      savings: financialSummary.savings,
      readyToAssign: input.budgetView?.readyToAssign ?? 0,
    },
    attention: {
      overspentCategories: countOverspentCategories(input.budgetView),
      uncategorisedTransactions: countUncategorisedTransactions(currentMonthTransactions),
    },
  };
}

export function buildMonthWindow(month: string, count: number): string[] {
  const [year, monthNumber] = parseMonth(month);
  const result: string[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(year, monthNumber - 1 - offset, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return result;
}

function calculateNetWorthAtMonthEnd(
  accounts: SidebarAccount[],
  transactions: Array<RegisterTransactionView & { accountId: string }>,
  month: string,
): number {
  const endDate = getMonthEndDate(month);

  return accounts.reduce((total, account) => {
    const accountTransactions = transactions.filter(
      (transaction) => transaction.accountId === account.id && transaction.date <= endDate,
    );
    const transactionTotal = accountTransactions.reduce(
      (accountTotal, transaction) => accountTotal + transaction.inflow - transaction.outflow,
      0,
    );

    return total + account.startingBalance + transactionTotal;
  }, 0);
}

function countOverspentCategories(budgetView: BudgetMonthView | null): number {
  if (!budgetView) return 0;

  return budgetView.categoryGroups.reduce(
    (total, group) => total + group.categories.filter((category) => category.isOverspent || category.available < 0).length,
    0,
  );
}

function countUncategorisedTransactions(
  transactions: Array<RegisterTransactionView & { accountId: string }>,
): number {
return transactions.filter(isUncategorisedRegisterTransaction).length;
}

function isTransactionInMonth(transaction: RegisterTransactionView, month: string): boolean {
  return transaction.date.slice(0, 7) === month;
}

function getMonthEndDate(month: string): string {
  const [year, monthNumber] = parseMonth(month);
  const date = new Date(year, monthNumber, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseMonth(month: string): [number, number] {
  const [rawYear, rawMonth] = month.split("-").map(Number);
  const now = new Date();
  return [rawYear || now.getFullYear(), rawMonth || now.getMonth() + 1];
}

function formatShortMonth(month: string): string {
  const [year, monthNumber] = parseMonth(month);
  return new Intl.DateTimeFormat("en-AU", { month: "short" }).format(new Date(year, monthNumber - 1, 1));
}

function formatLongMonth(month: string): string {
  const [year, monthNumber] = parseMonth(month);
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}
