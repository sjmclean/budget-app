import { addBudgetMonths, formatBudgetMonth } from "./incomeBudgetMonth";

const INCOME_CATEGORY_PREFIX = "__income_for__:";

export interface RegisterIncomeCategoryChoice {
  readonly id: string;
  readonly value: string;
  readonly incomeBudgetMonth: string;
}

export function registerIncomeCategoryChoices(
  transactionDate: string,
): readonly RegisterIncomeCategoryChoice[] {
  const transactionMonth = transactionDate.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(transactionMonth)) {
    return [];
  }

  return [transactionMonth, addBudgetMonths(transactionMonth, 1)].map((month) => ({
    id: `${INCOME_CATEGORY_PREFIX}${month}`,
    value: `Income for ${formatBudgetMonth(month)}`,
    incomeBudgetMonth: month,
  }));
}

export function resolveRegisterIncomeCategoryChoice(
  value: string,
  transactionDate: string,
): RegisterIncomeCategoryChoice | null {
  const normalised = value.trim().toLocaleLowerCase();
  return (
    registerIncomeCategoryChoices(transactionDate).find(
      (choice) =>
        choice.id.toLocaleLowerCase() === normalised ||
        choice.value.toLocaleLowerCase() === normalised,
    ) ?? null
  );
}

export function registerIncomeCategoryValue(
  transactionDate: string,
  incomeBudgetMonth?: string,
): string | null {
  if (!incomeBudgetMonth) return null;
  return (
    registerIncomeCategoryChoices(transactionDate).find(
      (choice) => choice.incomeBudgetMonth === incomeBudgetMonth,
    )?.value ?? null
  );
}
