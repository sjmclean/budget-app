import {
  projectBudget,
  type BudgetMonthProjection,
  type BudgetProjectionInput,
} from "../../../../../../packages/budget-engine/src/projection/projectBudget";
import type { BudgetMonthView } from "../../budget/budgetViewTypes";

export interface SqliteBudgetProjectionFacts extends BudgetProjectionInput {
  readonly snapshot: BudgetMonthView;
  readonly targetMonth: string;
}

export interface BudgetProjectionDifference {
  readonly path: string;
  readonly snapshotMinor: number;
  readonly projectedMinor: number;
  readonly deltaMinor: number;
}

export interface LocalBudgetProjectionDiagnostic {
  readonly budgetId: string;
  readonly fromMonth: string;
  readonly targetMonth: string;
  readonly matchesSnapshot: boolean;
  readonly projection: BudgetMonthProjection;
  readonly projections: readonly BudgetMonthProjection[];
  readonly differences: readonly BudgetProjectionDifference[];
}

/**
 * Compares a projection with the legacy month snapshot. Phase 3 keeps this
 * diagnostic for migration evidence even though projected money is now the
 * authoritative read result.
 */
export function diagnoseSqliteBudgetProjection(
  facts: SqliteBudgetProjectionFacts,
): LocalBudgetProjectionDiagnostic {
  const result = projectBudget(facts);
  const projection = result.months.find(({ month }) => month === facts.targetMonth);
  if (!projection) throw new Error(`Projection did not produce ${facts.targetMonth}.`);

  const differences: BudgetProjectionDifference[] = [];
  compare("readyToAssign", facts.snapshot.readyToAssign, projection.readyToAssign);
  compare("totalAssigned", facts.snapshot.totalAssigned, projection.assigned);
  compare("totalActivity", facts.snapshot.totalActivity, projection.activity);
  compare("totalAvailable", facts.snapshot.totalAvailable, projection.available);

  const projectedByCategory = new Map(
    projection.categories.map((category) => [category.categoryId, category]),
  );
  for (const group of facts.snapshot.categoryGroups) {
    for (const category of group.categories) {
      const projected = projectedByCategory.get(category.id);
      if (!projected) {
        differences.push({
          path: `categories.${category.id}`,
          snapshotMinor: toMinorUnits(category.available),
          projectedMinor: 0,
          deltaMinor: -toMinorUnits(category.available),
        });
        continue;
      }
      compare(`categories.${category.id}.previousAvailable`, category.previousAvailable, projected.previousAvailable);
      compare(`categories.${category.id}.assigned`, category.assigned, projected.assigned);
      compare(`categories.${category.id}.activity`, category.activity, projected.activity);
      compare(`categories.${category.id}.available`, category.available, projected.available);
    }
  }

  return {
    budgetId: facts.budgetId,
    fromMonth: facts.fromMonth,
    targetMonth: facts.targetMonth,
    matchesSnapshot: differences.length === 0,
    projection,
    projections: result.months,
    differences,
  };

  function compare(path: string, snapshotDisplay: number, projectedMinor: number) {
    const snapshotMinor = toMinorUnits(snapshotDisplay);
    if (snapshotMinor === projectedMinor) return;
    differences.push({
      path,
      snapshotMinor,
      projectedMinor,
      deltaMinor: projectedMinor - snapshotMinor,
    });
  }
}

export function toMinorUnits(displayAmount: number): number {
  if (!Number.isFinite(displayAmount)) {
    throw new Error("A snapshot money value must be finite.");
  }
  const minor = Math.round(displayAmount * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new Error("A snapshot money value exceeds safe integer minor units.");
  }
  return minor;
}

export function applyBudgetProjectionToSnapshot(
  snapshot: BudgetMonthView,
  projection: BudgetMonthProjection,
): BudgetMonthView {
  const projectedByCategory = new Map(
    projection.categories.map((category) => [category.categoryId, category]),
  );
  const categoryGroups = snapshot.categoryGroups.map((group) => {
    const categories = group.categories.flatMap((category) => {
      const projected = projectedByCategory.get(category.id);
      if (!projected) return [];
      return [{
        ...category,
        previousAvailable: toDisplayUnits(projected.previousAvailable),
        assigned: toDisplayUnits(projected.assigned),
        activity: toDisplayUnits(projected.activity),
        available: toDisplayUnits(projected.available),
        isOverspent: projected.isOverspent,
        overspendingHandling: projected.overspendingPolicy,
      }];
    });
    return {
      ...group,
      previousAvailable: categories.reduce((sum, category) => sum + category.previousAvailable, 0),
      assigned: categories.reduce((sum, category) => sum + category.assigned, 0),
      activity: categories.reduce((sum, category) => sum + category.activity, 0),
      available: categories.reduce((sum, category) => sum + category.available, 0),
      categories,
    };
  });
  return {
    ...snapshot,
    readyToAssign: toDisplayUnits(projection.readyToAssign),
    carriedForwardReadyToAssign: toDisplayUnits(projection.carriedForwardReadyToAssign),
    previousOverspending: toDisplayUnits(projection.previousOverspending),
    incomeForMonth: toDisplayUnits(projection.income),
    totalAssigned: toDisplayUnits(projection.assigned),
    totalActivity: toDisplayUnits(projection.activity),
    totalAvailable: toDisplayUnits(projection.available),
    categoryGroups,
  };
}

export function toDisplayUnits(minorAmount: number): number {
  if (!Number.isSafeInteger(minorAmount)) {
    throw new Error("Projected money must use safe integer minor units.");
  }
  return minorAmount / 100;
}
