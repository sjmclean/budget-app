import type { RegisterTransactionView } from "../../../features/accounts/accountRegisterTypes";

export interface FinancialSummaryTransaction extends RegisterTransactionView {
  accountId: string;
}

export interface FinancialSummaryMetrics {
  income: number;
  expenses: number;
  savings: number;
}

/**
 * Headline financial metrics shared by the Financial Overview and future reports.
 *
 * Income means external money entering the budget, regardless of whether the
 * inflow was assigned to Ready to Assign or directly to a category. Internal
 * account movements are excluded so transfers and credit-card payments do not
 * inflate dashboard income or expenses.
 */
export function buildFinancialSummary(transactions: FinancialSummaryTransaction[]): FinancialSummaryMetrics {
  const externalTransactions = transactions.filter((transaction) => !isInternalMovement(transaction));
  const income = externalTransactions.reduce((total, transaction) => total + transaction.inflow, 0);
  const expenses = externalTransactions.reduce((total, transaction) => total + transaction.outflow, 0);

  return {
    income,
    expenses,
    savings: income - expenses,
  };
}

export function isInternalMovement(transaction: RegisterTransactionView): boolean {
  if (transaction.transferId || transaction.transferAccountId || transaction.transferTransactionId) {
    return true;
  }

  const searchableText = [transaction.payee, transaction.category, transaction.memo]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return INTERNAL_MOVEMENT_PATTERNS.some((pattern) => searchableText.includes(pattern));
}

const INTERNAL_MOVEMENT_PATTERNS = [
  "starting balance",
  "opening balance",
  "balance adjustment",
  "reconciliation adjustment",
  "credit card payment",
];
