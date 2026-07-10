import { useEffect, useMemo, useRef, useState } from "react";
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
import { applyCategoryAssignedValues } from "./budgetMoneyMovement";
import { createBudgetAssignmentEditSession } from "./budgetAssignmentEditing";
import {
  executeUndoableBudgetAssignmentChanges,
  executeUndoableBudgetMoneyMovement,
  registerBudgetUndoRedoContext,
} from "./budgetUndoRedo";

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
  coverOverspending: (input: {
    overspentCategoryId: string;
    coveringCategoryId: string;
    amount: number;
  }) => void;
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
  const persistenceGateway = getAppPersistenceGateway();
  const categoriesPersistence = persistenceGateway.categories;
  const budgetViewPersistence = persistenceGateway.budgetView;
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
  const assignmentEditSessionRef = useRef(createBudgetAssignmentEditSession());
  const assignmentEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<BudgetMonthView | null>(null);

  useEffect(() =>
    registerBudgetUndoRedoContext(`${budgetId}:${month}`, {
      getBudgetMonthView(requestedMonth) {
        return budgetViewPersistence.getBudgetMonthView({
          budgetId,
          month: requestedMonth,
        });
      },
      async setCategoryAssignedValues({ month: requestedMonth, assignments }) {
        const nextData = await budgetViewPersistence.setCategoryAssignedValues({
          budgetId,
          month: requestedMonth,
          assignments,
        });
        setEditedData(nextData);
        return nextData;
      },
    }, {
      flushPending: () => flushPendingAssignmentEdits(),
    }),
  [budgetId, budgetViewPersistence, month]);

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
  dataRef.current = data;

  async function flushPendingAssignmentEdits() {
    if (assignmentEditTimerRef.current) {
      clearTimeout(assignmentEditTimerRef.current);
      assignmentEditTimerRef.current = null;
    }

    const changes = assignmentEditSessionRef.current.consume();
    if (changes.length === 0) {
      return;
    }

    const result = await executeUndoableBudgetAssignmentChanges({ month, changes });
    if (!result.performed) {
      setSaveError(result.error ?? "Failed to save budget assignment changes.");
    }
  }

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
    const currentData = dataRef.current;
    const category = currentData?.categoryGroups
      .flatMap((group) => group.categories)
      .find((item) => item.id === categoryId);

    if (!currentData || !category) {
      setSaveError("Unable to find the category being edited.");
      return;
    }

    setLastEditedCategoryId(categoryId);
    setSaveError(null);
    assignmentEditSessionRef.current.record({
      categoryId,
      categoryName: category.name,
      originalAssigned: category.assigned,
      finalAssigned: assigned,
    });

    setEditedData(
      applyCategoryAssignedValues(currentData, [{ categoryId, assigned }]),
    );

    if (assignmentEditTimerRef.current) {
      clearTimeout(assignmentEditTimerRef.current);
    }

    assignmentEditTimerRef.current = setTimeout(() => {
      void flushPendingAssignmentEdits();
    }, 1800);
  }

  function coverOverspending(input: {
    overspentCategoryId: string;
    coveringCategoryId: string;
    amount: number;
  }) {
    setLastEditedCategoryId(input.overspentCategoryId);
    setSaveError(null);

    const coveringCategory = data?.categoryGroups
      .flatMap((group) => group.categories)
      .find((category) => category.id === input.coveringCategoryId);
    const overspentCategory = data?.categoryGroups
      .flatMap((group) => group.categories)
      .find((category) => category.id === input.overspentCategoryId);

    if (!coveringCategory || !overspentCategory) {
      setSaveError("Unable to find the categories required to cover overspending.");
      return;
    }

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      setSaveError("Cover amount must be positive.");
      return;
    }

    if (coveringCategory.available < input.amount) {
      setSaveError("Covering category has insufficient available funds.");
      return;
    }

    void executeUndoableBudgetMoneyMovement({
      month,
      sourceCategoryId: input.coveringCategoryId,
      destinationCategoryId: input.overspentCategoryId,
      amount: input.amount,
    }).then((result) => {
      if (result.performed) {
        setSelectedCategoryId(input.overspentCategoryId);
        return;
      }

      setSaveError(result.error ?? "Failed to cover overspending.");
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
    coverOverspending,
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
