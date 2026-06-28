import { useEffect, useMemo, useState } from "react";
import { getAppPersistenceGateway } from "../persistence";
import { useBudgetView } from "./useBudgetView";
import type {
  BudgetActivityDrilldown,
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
  CategoryMergePreview,
} from "./budgetViewTypes";
import { isMoneyNegative } from "./moneyMath";

interface UseBudgetWorkspaceState {
  data: BudgetMonthView | null;
  isLoading: boolean;
  error: string | null;
  selectedCategory: BudgetCategoryView | null;
  selectedGroup: BudgetCategoryGroupView | null;
  overassignedCategoryIds: string[];
  categoryMergePreview: CategoryMergePreview | null;
  isCategoryMergePreviewLoading: boolean;
  activityDrilldown: BudgetActivityDrilldown | null;
  isActivityDrilldownLoading: boolean;
  openActivityDrilldown: (categoryId: string) => void;
  closeActivityDrilldown: () => void;
  selectCategory: (categoryId: string) => void;
  updateAssigned: (categoryId: string, assigned: number) => void;
  renameCategory: (categoryId: string, name: string) => void;
  setCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  moveCategory: (categoryId: string, direction: "up" | "down") => void;
  moveCategoryToPosition: (
    categoryId: string,
    targetCategoryId: string,
    placement: "before" | "after",
  ) => void;
  moveCategoryGroup: (groupId: string, direction: "up" | "down") => void;
  moveCategoryGroupToPosition: (
    groupId: string,
    targetGroupId: string,
    placement: "before" | "after",
  ) => void;
  updateCategoryNote: (categoryId: string, note: string) => void;
  updateCategoryGroupNote: (groupId: string, note: string) => void;
  previewCategoryMerge: (
    sourceCategoryId: string,
    targetCategoryId: string,
  ) => void;
  mergeCategory: (sourceCategoryId: string, targetCategoryId: string) => void;
  clearCategoryMergePreview: () => void;
  clearSelection: () => void;
}

export function useBudgetWorkspace(
  budgetId: string,
  month: string,
): UseBudgetWorkspaceState {
  const categoriesPersistence = getAppPersistenceGateway().categories;
  const budgetView = useBudgetView(budgetId, month);
  const [editedData, setEditedData] = useState<BudgetMonthView | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [lastEditedCategoryId, setLastEditedCategoryId] = useState<
    string | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryMergePreview, setCategoryMergePreview] =
    useState<CategoryMergePreview | null>(null);
  const [isCategoryMergePreviewLoading, setIsCategoryMergePreviewLoading] =
    useState(false);
  const [activityDrilldown, setActivityDrilldown] =
    useState<BudgetActivityDrilldown | null>(null);
  const [isActivityDrilldownLoading, setIsActivityDrilldownLoading] =
    useState(false);

  useEffect(() => {
    setEditedData(null);
    setSaveError(null);
    setLastEditedCategoryId(null);
    setCategoryMergePreview(null);
    setIsCategoryMergePreviewLoading(false);
    setActivityDrilldown(null);
    setIsActivityDrilldownLoading(false);
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
      const category = group.categories.find(
        (item) => item.id === selectedCategoryId,
      );

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
    data && isMoneyNegative(data.readyToAssign) && lastEditedCategoryId
      ? [lastEditedCategoryId]
      : [];


  function openActivityDrilldown(categoryId: string) {
    setSaveError(null);
    setIsActivityDrilldownLoading(true);

    void categoriesPersistence
      .getCategoryActivityDrilldown({
        budgetId,
        month,
        categoryId,
      })
      .then((drilldown) => {
        setActivityDrilldown(drilldown);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to load category activity.",
        );
        setActivityDrilldown(null);
      })
      .finally(() => {
        setIsActivityDrilldownLoading(false);
      });
  }

  function closeActivityDrilldown() {
    setActivityDrilldown(null);
    setIsActivityDrilldownLoading(false);
  }

  function selectCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setCategoryMergePreview(null);
  }

  function clearSelection() {
    setSelectedCategoryId(null);
    setCategoryMergePreview(null);
  }

  function updateAssigned(categoryId: string, assigned: number) {
    setLastEditedCategoryId(categoryId);
    setSaveError(null);

    void categoriesPersistence
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

    void categoriesPersistence
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

    void categoriesPersistence
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

    void categoriesPersistence
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

  function moveCategoryToPosition(
    categoryId: string,
    targetCategoryId: string,
    placement: "before" | "after",
  ) {
    setSaveError(null);

    void categoriesPersistence
      .moveCategoryToPosition({
        budgetId,
        month,
        categoryId,
        targetCategoryId,
        placement,
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

    void categoriesPersistence
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
          error instanceof Error
            ? error.message
            : "Failed to move category group.",
        );
      });
  }



  function moveCategoryGroupToPosition(
    groupId: string,
    targetGroupId: string,
    placement: "before" | "after",
  ) {
    setSaveError(null);

    void categoriesPersistence
      .moveCategoryGroupToPosition({
        budgetId,
        month,
        groupId,
        targetGroupId,
        placement,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId((currentCategoryId) => currentCategoryId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to move category group.",
        );
      });
  }


  function updateCategoryNote(categoryId: string, note: string) {
    setSaveError(null);

    void categoriesPersistence
      .updateCategoryNote({
        budgetId,
        month,
        categoryId,
        note,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to update category note.",
        );
      });
  }

  function updateCategoryGroupNote(groupId: string, note: string) {
    setSaveError(null);

    void categoriesPersistence
      .updateCategoryGroupNote({
        budgetId,
        month,
        groupId,
        note,
      })
      .then((nextData) => {
        setEditedData(nextData);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to update category group note.",
        );
      });
  }

  function previewCategoryMerge(
    sourceCategoryId: string,
    targetCategoryId: string,
  ) {
    setSaveError(null);
    setIsCategoryMergePreviewLoading(true);

    void categoriesPersistence
      .getCategoryMergePreview({
        budgetId,
        month,
        sourceCategoryId,
        targetCategoryId,
      })
      .then((preview) => {
        setCategoryMergePreview(preview);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to preview category merge.",
        );
        setCategoryMergePreview(null);
      })
      .finally(() => {
        setIsCategoryMergePreviewLoading(false);
      });
  }

  function mergeCategory(sourceCategoryId: string, targetCategoryId: string) {
    setSaveError(null);

    void categoriesPersistence
      .mergeCategory({
        budgetId,
        month,
        sourceCategoryId,
        targetCategoryId,
      })
      .then((nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(targetCategoryId);
        setCategoryMergePreview(null);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "Failed to merge categories.",
        );
      });
  }

  function clearCategoryMergePreview() {
    setCategoryMergePreview(null);
  }

  return {
    data,
    isLoading: budgetView.isLoading,
    error: saveError ?? budgetView.error,
    selectedCategory: selected.selectedCategory,
    selectedGroup: selected.selectedGroup,
    overassignedCategoryIds,
    categoryMergePreview,
    isCategoryMergePreviewLoading,
    activityDrilldown,
    isActivityDrilldownLoading,
    openActivityDrilldown,
    closeActivityDrilldown,
    selectCategory,
    updateAssigned,
    renameCategory,
    setCategoryArchived,
    moveCategory,
    moveCategoryToPosition,
    moveCategoryGroup,
    moveCategoryGroupToPosition,
    updateCategoryNote,
    updateCategoryGroupNote,
    previewCategoryMerge,
    mergeCategory,
    clearCategoryMergePreview,
    clearSelection,
  };
}
