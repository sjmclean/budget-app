import type {
  RegisterSplitLineView,
  RegisterTransactionView,
} from "../../../features/accounts/accountRegisterTypes";

export interface FinancialSummaryTransaction extends RegisterTransactionView {
  accountId: string;
}

export interface FinancialSummaryMetrics {
  income: number;
  generalIncome: number;
  countedCategoryIncome: number;
  categoryInflows: number;
  expenses: number;
  savings: number;
}

/**
 * Headline financial metrics shared by the Financial Overview and reports.
 *
 * Only inflows explicitly classified as income contribute to headline income.
 * Ordinary category inflows remain separate. Internal account movements are
 * excluded so transfers and credit-card payments do not inflate income or
 * expenses. Split lines are classified independently.
 */
export function buildFinancialSummary(
  transactions: FinancialSummaryTransaction[],
): FinancialSummaryMetrics {
  const totals = transactions.reduce(
    (summary, transaction) => {
      if (isInternalMovement(transaction)) return summary;

      const lines = transaction.splitLines?.length
        ? transaction.splitLines
        : [transaction];

      for (const line of lines) {
        if (isTransferLine(line)) continue;

        summary.expenses += line.outflow;

        if (line.inflowClassification === "income") {
          summary.income += line.inflow;
          if (line.categoryId) {
            summary.countedCategoryIncome += line.inflow;
          } else {
            summary.generalIncome += line.inflow;
          }
        } else if (line.inflowClassification === "category-inflow") {
          summary.categoryInflows += line.inflow;
        }
      }

      return summary;
    },
    {
      income: 0,
      generalIncome: 0,
      countedCategoryIncome: 0,
      categoryInflows: 0,
      expenses: 0,
    },
  );

  return {
    ...totals,
    savings: totals.income - totals.expenses,
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

function isTransferLine(
  line: Pick<
    RegisterTransactionView | RegisterSplitLineView,
    "transferId" | "transferAccountId" | "transferTransactionId"
  >,
): boolean {
  return Boolean(
    line.transferId ||
    line.transferAccountId ||
    line.transferTransactionId
  );
}

const INTERNAL_MOVEMENT_PATTERNS = [
  "starting balance",
  "opening balance",
  "balance adjustment",
  "reconciliation adjustment",
  "credit card payment",
];
