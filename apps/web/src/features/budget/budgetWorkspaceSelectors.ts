import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
} from "./budgetViewTypes";
import { isMoneyNegative } from "./moneyMath";
import { isCreditCardPaymentCategory } from "./creditCardPaymentCategories";

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

export const ARCHIVED_CATEGORIES_GROUP_ID = "__archived_categories__";

export function getActiveCategoryGroups(
  categoryGroups: BudgetCategoryGroupView[],
): BudgetCategoryGroupView[] {
  return categoryGroups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) => !category.isArchived),
    }))
    .filter((group) => group.categories.length > 0);
}

export function buildArchivedCategoriesGroup(
  categoryGroups: BudgetCategoryGroupView[],
): BudgetCategoryGroupView | null {
  const categories = categoryGroups.flatMap((group) =>
    group.categories.filter((category) => category.isArchived),
  );

  if (categories.length === 0) return null;

  return {
    id: ARCHIVED_CATEGORIES_GROUP_ID,
    name: `Archived Categories (${categories.length})`,
    previousAvailable: categories.reduce((sum, category) => sum + category.previousAvailable, 0),
    assigned: categories.reduce((sum, category) => sum + category.assigned, 0),
    activity: categories.reduce((sum, category) => sum + category.activity, 0),
    available: categories.reduce((sum, category) => sum + category.available, 0),
    note: "Archived categories are kept here for historical reference. Restore a category to return it to its original group.",
    categories,
  };
}

export function buildArchivedCategorySourceGroupMap(
  categoryGroups: BudgetCategoryGroupView[],
): Map<string, BudgetCategoryGroupView> {
  return new Map(
    categoryGroups.flatMap((group) =>
      group.categories
        .filter((category) => category.isArchived)
        .map((category) => [category.id, group] as const),
    ),
  );
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
      .filter(
        (category) =>
          !category.isArchived &&
          !isCreditCardPaymentCategory(category.id),
      )
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
