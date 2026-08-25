import type { CategoryGoal } from "../../../../../../packages/types/src/CategoryGoal";
import {
  isCreditCardPaymentCategory,
  isCreditCardPaymentGroup,
} from "../../budget/creditCardPaymentCategories";
import { toMinorUnits } from "./sqliteBudgetProjectionAdapter";
import { notifyLocalFirstMutationCommitted } from "./mutationEvents";

export interface LocalCategoryGoalRow {
  id: string;
  budgetId: string;
  categoryId: string;
  type: CategoryGoal["type"];
  targetAmount: number;
  targetMonth: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryGoalOwnerRow {
  budgetId: string;
  groupId: string;
}

export function assertCategoryGoalCategoryForPersistence(
  goal: Pick<CategoryGoal, "budgetId" | "categoryId">,
  category: CategoryGoalOwnerRow | null,
): void {
  if (!category) throw new Error("The Category Goal category was not found.");
  if (category.budgetId !== goal.budgetId) {
    throw new Error("The Category Goal category belongs to another budget.");
  }
  if (isCreditCardPaymentGroup(category.groupId) || isCreditCardPaymentCategory(goal.categoryId)) {
    throw new Error("Managed credit-card payment categories cannot have Goals.");
  }
}

export function assertValidCategoryGoalForPersistence(goal: CategoryGoal): LocalCategoryGoalRow {
  if (!goal.id.trim() || !goal.budgetId.trim() || !goal.categoryId.trim()) {
    throw new Error("Category Goal identity is required.");
  }
  if (!goal.createdAt.trim() || !goal.updatedAt.trim()) {
    throw new Error("Category Goal timestamps are required.");
  }
  if (isCreditCardPaymentCategory(goal.categoryId)) {
    throw new Error("Managed credit-card payment categories cannot have Goals.");
  }
  if (![
    "monthly-funding",
    "target-balance",
    "target-balance-by-date",
  ].includes(goal.type)) {
    throw new Error("Unsupported Category Goal type.");
  }
  if (goal.type === "target-balance-by-date") {
    const match = /^(\d{4})-(\d{2})$/.exec(goal.targetMonth ?? "");
    const month = match ? Number(match[2]) : 0;
    if (!match || month < 1 || month > 12) {
      throw new Error("A dated Category Goal requires a valid YYYY-MM target month.");
    }
  } else if (goal.targetMonth !== null) {
    throw new Error("A non-dated Category Goal cannot have a target month.");
  }
  const targetAmount = toMinorUnits(goal.targetAmount);
  if (targetAmount <= 0) {
    throw new Error("Category Goal target amount must be at least one cent.");
  }
  return { ...goal, targetAmount };
}

export function prepareCategoryGoalWriteForPersistence(
  goal: CategoryGoal,
  category: CategoryGoalOwnerRow | null,
  current: CategoryGoal | null,
): LocalCategoryGoalRow {
  assertCategoryGoalCategoryForPersistence(goal, category);
  const row = assertValidCategoryGoalForPersistence(goal);
  if (current && current.id !== goal.id) {
    throw new Error("A Category Goal update cannot change Goal identity.");
  }
  return row;
}

export function categoryGoalFromRow(row: LocalCategoryGoalRow): CategoryGoal {
  if (!Number.isSafeInteger(row.targetAmount) || row.targetAmount <= 0) {
    throw new Error("Stored Category Goal target amount is invalid.");
  }
  return { ...row, targetAmount: row.targetAmount / 100 };
}

export function normaliseCategoryGoalForPersistence(goal: CategoryGoal): CategoryGoal {
  return categoryGoalFromRow(assertValidCategoryGoalForPersistence(goal));
}

export function categoryGoalsEqual(left: CategoryGoal | null, right: CategoryGoal | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id &&
    left.budgetId === right.budgetId &&
    left.categoryId === right.categoryId &&
    left.type === right.type &&
    left.targetAmount === right.targetAmount &&
    left.targetMonth === right.targetMonth &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt;
}

export async function commitCategoryGoalMutation<T>(
  budgetId: string,
  mutation: () => Promise<T>,
  shouldNotify: (result: T) => boolean = () => true,
): Promise<T> {
  const result = await mutation();
  if (shouldNotify(result)) notifyLocalFirstMutationCommitted(budgetId);
  return result;
}
