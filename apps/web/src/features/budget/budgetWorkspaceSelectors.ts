import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
} from "./budgetViewTypes";
import { isMoneyNegative } from "./moneyMath";

export interface OverspendingCoverOption {
  id: string;
  name: string;
  groupName: string;
  available: number;
}

export interface BudgetCategoryLocation {
  groupId: string;
  index: number;
}

export function getVisibleCategoryGroups(
  categoryGroups: BudgetCategoryGroupView[],
  hideArchivedCategories: boolean,
): BudgetCategoryGroupView[] {
  if (!hideArchivedCategories) {
    return categoryGroups;
  }

  return categoryGroups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) => !category.isArchived),
    }))
    .filter((group) => group.categories.length > 0);
}

export function countArchivedCategories(
  categoryGroups: BudgetCategoryGroupView[],
): number {
  return categoryGroups.reduce(
    (count, group) =>
      count + group.categories.filter((category) => category.isArchived).length,
    0,
  );
}

export function isSelectedCategoryVisible(
  selectedCategory: BudgetCategoryView | null,
  hideArchivedCategories: boolean,
): boolean {
  return (
    selectedCategory !== null &&
    !(hideArchivedCategories && selectedCategory.isArchived)
  );
}

export function countOverspentCategories(
  categoryGroups: BudgetCategoryGroupView[],
): number {
  return categoryGroups.reduce(
    (count, group) =>
      count +
      group.categories.filter((category) => isMoneyNegative(category.available)).length,
    0,
  );
}

export function buildOverspendingCoverOptions(
  categoryGroups: BudgetCategoryGroupView[],
): OverspendingCoverOption[] {
  return categoryGroups.flatMap((group) =>
    group.categories
      .filter((category) => !category.isArchived)
      .map((category) => ({
        id: category.id,
        name: category.name,
        groupName: group.name,
        available: category.available,
      })),
  );
}

export function findCategoryLocation(
  categoryGroups: BudgetCategoryGroupView[],
  categoryId: string,
): BudgetCategoryLocation | null {
  for (const group of categoryGroups) {
    const index = group.categories.findIndex((category) => category.id === categoryId);

    if (index !== -1) {
      return { groupId: group.id, index };
    }
  }

  return null;
}
