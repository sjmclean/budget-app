import type { RegisterSplitLineView, RegisterTransactionView } from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";

export interface SplitLineDraft {
  id: string;
  category: string;
  categoryId?: string;
  memo: string;
  outflow: string;
  inflow: string;
}

export function parseRegisterMoney(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createSplitLineDraft(): SplitLineDraft {
  return {
    id: createLocalId(),
    category: "",
    memo: "",
    outflow: "",
    inflow: "",
  };
}

function createLocalId(): string {
  return `split-${createRuntimeUuid()}`;
}

export function splitDraftsFromTransaction(
  transaction: RegisterTransactionView,
): SplitLineDraft[] {
  return (transaction.splitLines ?? []).map((line) => ({
    id: line.id,
    category: line.category,
    categoryId: line.categoryId,
    memo: line.memo ?? "",
    outflow: line.outflow ? line.outflow.toFixed(2) : "",
    inflow: line.inflow ? line.inflow.toFixed(2) : "",
  }));
}

export function buildSplitLines(
  splitLines: SplitLineDraft[],
  categoryOptions: BudgetCategoryOption[],
): RegisterSplitLineView[] {
  return splitLines
    .map((line) => {
      const categoryName = line.category.trim();
      const categoryOption = findCategoryOption(categoryName, categoryOptions);

      return {
        id: line.id,
        category: categoryOption?.name ?? categoryName,
        categoryId: categoryOption?.id,
        memo: line.memo.trim(),
        outflow: parseRegisterMoney(line.outflow),
        inflow: parseRegisterMoney(line.inflow),
      };
    })
    .filter(
      (line) =>
        line.category.length > 0 && (line.outflow > 0 || line.inflow > 0),
    );
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

export function normaliseCategoryName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function totalsFromSplitLines(splitLines: RegisterSplitLineView[]): {
  outflow: number;
  inflow: number;
} {
  return splitLines.reduce(
    (totals, line) => ({
      outflow: totals.outflow + line.outflow,
      inflow: totals.inflow + line.inflow,
    }),
    { outflow: 0, inflow: 0 },
  );
}

export function totalsFromSplitDrafts(splitLines: readonly SplitLineDraft[]): {
  outflow: number;
  inflow: number;
} {
  return splitLines.reduce(
    (totals, line) => ({
      outflow: totals.outflow + parseRegisterMoney(line.outflow),
      inflow: totals.inflow + parseRegisterMoney(line.inflow),
    }),
    { outflow: 0, inflow: 0 },
  );
}

export function hasIncompleteSplitDrafts(
  splitLines: readonly SplitLineDraft[],
): boolean {
  return splitLines.some((line) => {
    const hasAmount =
      parseRegisterMoney(line.outflow) > 0 || parseRegisterMoney(line.inflow) > 0;
    return hasAmount && line.category.trim().length === 0;
  });
}

const SPLIT_BALANCE_TOLERANCE = 0.005;

function normaliseMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getSplitBalanceStatus({
  parentOutflow,
  parentInflow,
  splitOutflow,
  splitInflow,
}: {
  parentOutflow: number;
  parentInflow: number;
  splitOutflow: number;
  splitInflow: number;
}): {
  parentAmount: number;
  splitAmount: number;
  remaining: number;
  isBalanced: boolean;
  isOverAssigned: boolean;
  activeSide: "outflow" | "inflow";
} {
  const activeSide = parentInflow > parentOutflow ? "inflow" : "outflow";
  const parentAmount = activeSide === "inflow" ? parentInflow : parentOutflow;
  const splitAmount = activeSide === "inflow" ? splitInflow : splitOutflow;
  const remaining = normaliseMoney(parentAmount - splitAmount);

  return {
    parentAmount,
    splitAmount,
    remaining,
    isBalanced: Math.abs(remaining) < SPLIT_BALANCE_TOLERANCE,
    isOverAssigned: remaining < -SPLIT_BALANCE_TOLERANCE,
    activeSide,
  };
}

export function isSplitBalanced(
  parentOutflow: number,
  parentInflow: number,
  splitLines: RegisterSplitLineView[],
): boolean {
  const totals = totalsFromSplitLines(splitLines);
  return getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow: totals.outflow,
    splitInflow: totals.inflow,
  }).isBalanced;
}

export function isSplitDraftBalanced(
  parentOutflow: number,
  parentInflow: number,
  splitLines: readonly SplitLineDraft[],
): boolean {
  const totals = totalsFromSplitDrafts(splitLines);
  return getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow: totals.outflow,
    splitInflow: totals.inflow,
  }).isBalanced;
}
