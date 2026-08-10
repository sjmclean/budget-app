import type { BudgetMonthProjection } from "./projectBudget.js";

export interface BudgetProjectionEvidence {
  readonly month: string;
  readonly readyToAssign?: number;
  readonly categoryActivityById?: Readonly<Record<string, number>>;
  readonly categoryAvailableById?: Readonly<Record<string, number>>;
}

export interface BudgetProjectionReconciliationDifference {
  readonly path: string;
  readonly expectedMinor: number;
  readonly projectedMinor: number;
  readonly deltaMinor: number;
}

export function reconcileBudgetProjection(
  projection: BudgetMonthProjection,
  evidence: BudgetProjectionEvidence,
  toleranceMinor = 0,
): readonly BudgetProjectionReconciliationDifference[] {
  if (projection.month !== evidence.month) {
    throw new Error(`Projection month ${projection.month} does not match evidence month ${evidence.month}.`);
  }
  if (!Number.isSafeInteger(toleranceMinor) || toleranceMinor < 0) {
    throw new Error("Projection reconciliation tolerance must be non-negative minor units.");
  }
  const differences: BudgetProjectionReconciliationDifference[] = [];
  if (evidence.readyToAssign !== undefined) {
    compare("readyToAssign", evidence.readyToAssign, projection.readyToAssign);
  }
  const projected = new Map(projection.categories.map((category) => [category.categoryId, category]));
  for (const [categoryId, expected] of Object.entries(evidence.categoryActivityById ?? {})) {
    compare(`categories.${categoryId}.activity`, expected, projected.get(categoryId)?.activity ?? 0);
  }
  for (const [categoryId, expected] of Object.entries(evidence.categoryAvailableById ?? {})) {
    compare(`categories.${categoryId}.available`, expected, projected.get(categoryId)?.available ?? 0);
  }
  return differences;

  function compare(path: string, expectedMinor: number, projectedMinor: number) {
    if (!Number.isSafeInteger(expectedMinor)) throw new Error(`${path} evidence must use minor units.`);
    const deltaMinor = projectedMinor - expectedMinor;
    if (Math.abs(deltaMinor) <= toleranceMinor) return;
    differences.push({ path, expectedMinor, projectedMinor, deltaMinor });
  }
}
