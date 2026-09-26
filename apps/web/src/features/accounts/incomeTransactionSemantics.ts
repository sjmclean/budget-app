export type InflowClassification = "income" | "category-inflow";

const BUDGET_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function transactionMonth(date: string): string {
  const month = date.slice(0, 7);
  if (date.length !== 10 || !BUDGET_MONTH_PATTERN.test(month)) {
    throw new Error(`Invalid transaction date ${date}.`);
  }
  return month;
}

export function followingBudgetMonth(month: string): string {
  if (!BUDGET_MONTH_PATTERN.test(month)) {
    throw new Error(`Invalid budget month ${month}.`);
  }
  const [year, value] = month.split("-").map(Number);
  const nextMonth = value === 12 ? 1 : value + 1;
  const nextYear = value === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function validGeneralIncomeBudgetMonth(
  date: string,
  incomeBudgetMonth: string,
): boolean {
  const month = transactionMonth(date);
  return incomeBudgetMonth === month ||
    incomeBudgetMonth === followingBudgetMonth(month);
}

export interface CanonicalInflowSemanticsInput {
  readonly date: string;
  readonly amount: number;
  readonly categoryId?: string | null;
  readonly transferAccountId?: string | null;
  readonly incomeBudgetMonth?: string | null;
  readonly inflowClassification?: InflowClassification | null;
}

export interface CanonicalInflowSemantics {
  readonly incomeBudgetMonth: string | null;
  readonly inflowClassification: InflowClassification | null;
}

/**
 * Validates the canonical meaning of a transaction/split inflow.
 *
 * General income has no ordinary category and carries an explicit current- or
 * following-month income destination. Direct-category positive inflows may be
 * genuine income or category inflows/refunds. Outflows and transfers carry no
 * income classification.
 */
export function requireCanonicalInflowSemantics(
  input: CanonicalInflowSemanticsInput,
): CanonicalInflowSemantics {
  const categoryId = input.categoryId ?? null;
  const transferAccountId = input.transferAccountId ?? null;
  const incomeBudgetMonth = input.incomeBudgetMonth ?? null;
  const classification = input.inflowClassification ?? null;

  if (input.amount <= 0 || transferAccountId) {
    if (incomeBudgetMonth || classification) {
      throw new Error(
        "Outflows and transfers cannot carry income budget or inflow classification metadata.",
      );
    }
    return {
      incomeBudgetMonth: null,
      inflowClassification: null,
    };
  }

  if (incomeBudgetMonth) {
    if (categoryId) {
      throw new Error(
        "General Income for Month cannot also target an ordinary category.",
      );
    }
    if (classification !== "income") {
      throw new Error(
        "General Income for Month must be classified as income.",
      );
    }
    if (!validGeneralIncomeBudgetMonth(input.date, incomeBudgetMonth)) {
      throw new Error(
        "Income budget month must be the transaction month or the following month.",
      );
    }
    return {
      incomeBudgetMonth,
      inflowClassification: "income",
    };
  }

  if (!categoryId) {
    if (classification) {
      throw new Error(
        "An uncategorised inflow cannot carry income classification without an Income for Month destination.",
      );
    }
    return {
      incomeBudgetMonth: null,
      inflowClassification: null,
    };
  }

  if (classification !== "income" && classification !== "category-inflow") {
    throw new Error(
      "A positive direct-category inflow requires an explicit inflow classification.",
    );
  }

  return {
    incomeBudgetMonth: null,
    inflowClassification: classification,
  };
}
