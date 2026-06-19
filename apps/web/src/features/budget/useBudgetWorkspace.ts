import { useMemo, useState } from "react";
import { useBudgetView } from "./useBudgetView";
import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
} from "./budgetViewTypes";

interface UseBudgetWorkspaceState {
  data: BudgetMonthView | null;
  isLoading: boolean;
  error: string | null;
  selectedCategory: BudgetCategoryView | null;
  selectedGroup: BudgetCategoryGroupView | null;
  overassignedCategoryIds: string[];
  selectCategory: (categoryId: string) => void;
  updateAssigned: (categoryId: string, assigned: number) => void;
  clearSelection: () => void;
}

function recalculateGroup(group: BudgetCategoryGroupView): BudgetCategoryGroupView {
  const assigned = group.categories.reduce((sum, category) => sum + category.assigned, 0);
  const activity = group.categories.reduce((sum, category) => sum + category.activity, 0);
  const available = group.categories.reduce((sum, category) => sum + category.available, 0);

  return {
    ...group,
    assigned,
    activity,
    available,
  };
}

function recalculateBudget(data: BudgetMonthView): BudgetMonthView {
  const totalAssigned = data.categoryGroups.reduce((sum, group) => sum + group.assigned, 0);
  const totalActivity = data.categoryGroups.reduce((sum, group) => sum + group.activity, 0);
  const totalAvailable = data.categoryGroups.reduce((sum, group) => sum + group.available, 0);

  return {
    ...data,
    totalAssigned,
    totalActivity,
    totalAvailable,
  };
}

export function useBudgetWorkspace(
  budgetId: string,
  month: string,
): UseBudgetWorkspaceState {
  const budgetView = useBudgetView(budgetId, month);
  const [editedData, setEditedData] = useState<BudgetMonthView | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [lastEditedCategoryId, setLastEditedCategoryId] = useState<string | null>(null);

  const data = editedData ?? budgetView.data;

  const selected = useMemo(() => {
    if (!data || !selectedCategoryId) {
      return {
        selectedCategory: null,
        selectedGroup: null,
      };
    }

    for (const group of data.categoryGroups) {
      const category = group.categories.find((item) => item.id === selectedCategoryId);

      if (category) {
        return {
          selectedCategory: category,
          selectedGroup: group,
        };
      }
    }

    return {
      selectedCategory: null,
      selectedGroup: null,
    };
  }, [data, selectedCategoryId]);

  const overassignedCategoryIds =
    data && data.readyToAssign < 0 && lastEditedCategoryId ? [lastEditedCategoryId] : [];

  function selectCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
  }

  function clearSelection() {
    setSelectedCategoryId(null);
  }

  function updateAssigned(categoryId: string, assigned: number) {
    const source = editedData ?? budgetView.data;

    if (!source) {
      return;
    }

    const nextCategoryGroups = source.categoryGroups.map((group) => {
      const nextCategories = group.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        const available = assigned + category.activity;

        return {
          ...category,
          assigned,
          available,
          isOverspent: available < 0,
        };
      });

      return recalculateGroup({
        ...group,
        categories: nextCategories,
      });
    });

    const nextTotalAssigned = nextCategoryGroups.reduce((sum, group) => sum + group.assigned, 0);
    const assignedDelta = nextTotalAssigned - source.totalAssigned;

    const nextData = recalculateBudget({
      ...source,
      readyToAssign: source.readyToAssign - assignedDelta,
      categoryGroups: nextCategoryGroups,
    });

    setLastEditedCategoryId(categoryId);
    setEditedData(nextData);
  }

  return {
    data,
    isLoading: budgetView.isLoading,
    error: budgetView.error,
    selectedCategory: selected.selectedCategory,
    selectedGroup: selected.selectedGroup,
    overassignedCategoryIds,
    selectCategory,
    updateAssigned,
    clearSelection,
  };
}
