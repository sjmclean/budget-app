import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
} from "./budgetViewTypes";
import { isSelectedCategoryVisible } from "./budgetWorkspaceSelectors";

export interface BudgetInspectorState {
  visibleSelectedCategory: BudgetCategoryView | null;
  visibleSelectedGroup: BudgetCategoryGroupView | null;
  selectedCategoryIsOverassignedSource: boolean;
}

export function buildBudgetInspectorState({
  selectedCategory,
  selectedGroup,
  hideArchivedCategories,
  overassignedCategoryIds,
}: {
  selectedCategory: BudgetCategoryView | null;
  selectedGroup: BudgetCategoryGroupView | null;
  hideArchivedCategories: boolean;
  overassignedCategoryIds: string[];
}): BudgetInspectorState {
  const selectedCategoryVisible = isSelectedCategoryVisible(
    selectedCategory,
    hideArchivedCategories,
  );
  const visibleSelectedCategory = selectedCategoryVisible
    ? selectedCategory
    : null;
  const visibleSelectedGroup = selectedCategoryVisible ? selectedGroup : null;

  return {
    visibleSelectedCategory,
    visibleSelectedGroup,
    selectedCategoryIsOverassignedSource:
      visibleSelectedCategory !== null &&
      overassignedCategoryIds.includes(visibleSelectedCategory.id),
  };
}
