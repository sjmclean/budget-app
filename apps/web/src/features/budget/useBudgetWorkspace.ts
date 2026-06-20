import { useEffect, useMemo, useState } from "react";
import { budgetViewService } from "./budgetViewService";
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
  renameCategory: (categoryId: string, name: string) => void;
  setCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  moveCategory: (categoryId: string, direction: "up" | "down") => void;
  moveCategoryGroup: (groupId: string, direction: "up" | "down") => void;
  clearSelection: () => void;
}

export function useBudgetWorkspace(
  budgetId: string,
  month: string,
): UseBudgetWorkspaceState {
  const budgetView = useBudgetView(budgetId, month);
  const [editedData, setEditedData] = useState<BudgetMonthView | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [lastEditedCategoryId, setLastEditedCategoryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditedData(null);
    setSaveError(null);
    setLastEditedCategoryId(null);
  }, [budgetId, month]);

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
    setLastEditedCategoryId(categoryId);
    setSaveError(null);

    void budgetViewService
      .updateAssigned({
        budgetId,
        month,
        categoryId,
        assigned,
      })
      .then((nextData) => {
        setEditedData(nextData);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to save category assignment.",
        );
      });
  }

  function renameCategory(categoryId: string, name: string) {
    setSaveError(null);

    void budgetViewService
      .renameCategory({
        budgetId,
        month,
        categoryId,
        name,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to rename category.",
        );
      });
  }

  function setCategoryArchived(categoryId: string, isArchived: boolean) {
    setSaveError(null);

    void budgetViewService
      .setCategoryArchived({
        budgetId,
        month,
        categoryId,
        isArchived,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to update category archive status.",
        );
      });
  }

  function moveCategory(categoryId: string, direction: "up" | "down") {
    setSaveError(null);

    void budgetViewService
      .moveCategory({
        budgetId,
        month,
        categoryId,
        direction,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to move category.",
        );
      });
  }

  function moveCategoryGroup(groupId: string, direction: "up" | "down") {
    setSaveError(null);

    void budgetViewService
      .moveCategoryGroup({
        budgetId,
        month,
        groupId,
        direction,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId((currentCategoryId) => currentCategoryId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to move category group.",
        );
      });
  }

  return {
    data,
    isLoading: budgetView.isLoading,
    error: saveError ?? budgetView.error,
    selectedCategory: selected.selectedCategory,
    selectedGroup: selected.selectedGroup,
    overassignedCategoryIds,
    selectCategory,
    updateAssigned,
    renameCategory,
    setCategoryArchived,
    moveCategory,
    moveCategoryGroup,
    clearSelection,
  };
}
