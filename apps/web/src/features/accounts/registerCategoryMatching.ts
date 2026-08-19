import type { BudgetCategoryOption } from "../budget/budgetViewTypes";

export const SPLIT_CATEGORY_LABEL = "Split...";

export function resolveRegisterTransactionCategory(input: {
  splitLineCount: number;
  categoryId?: string | null;
  categoryName?: string | null;
  transferAccountId?: string | null;
}): string {
  if (input.splitLineCount > 0) {
    return SPLIT_CATEGORY_LABEL;
  }

  if (input.categoryId) {
    return input.categoryName?.trim() || "Uncategorised";
  }

  if (input.transferAccountId) {
    return "Transfer";
  }

  return "Uncategorised";
}

export function resolveRegisterTransactionEditCategory(
  category: string,
  splitLineCount: number,
): string {
  return splitLineCount > 0
    ? SPLIT_CATEGORY_LABEL
    : category;
}

export function isSplitCategoryValue(value: string): boolean {
  const normalised = value.trim().toLowerCase();
  return normalised === "split" || normalised === "split...";
}

export function normaliseCategoryName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function findCategoryOption(
  categoryName: string,
  categoryOptions: BudgetCategoryOption[],
): BudgetCategoryOption | undefined {
  const normalised = normaliseCategoryName(categoryName);

  return categoryOptions.find(
    (category) =>
      normaliseCategoryName(category.name) === normalised ||
      normaliseCategoryName(category.id) === normalised,
  );
}
