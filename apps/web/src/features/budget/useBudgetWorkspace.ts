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
  const mountedRef = useRef(true);
  const workspaceIdentityRef = useRef(`${budgetId}:${month}`);
  const activityRequestVersionRef = useRef(0);
  const mergePreviewRequestVersionRef = useRef(0);
  const mutationVersionRef = useRef(0);

  workspaceIdentityRef.current = `${budgetId}:${month}`;

  function isWorkspaceCurrent(identity: string): boolean {
    return mountedRef.current && workspaceIdentityRef.current === identity;
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      activityRequestVersionRef.current += 1;
      mergePreviewRequestVersionRef.current += 1;
      mutationVersionRef.current += 1;

      if (assignmentEditTimerRef.current) {
        clearTimeout(assignmentEditTimerRef.current);
        assignmentEditTimerRef.current = null;
      }

      const pendingChanges = assignmentEditSessionRef.current.consume();
      if (pendingChanges.length > 0) {
        void budgetViewPersistence
          .setCategoryAssignedValues({
            budgetId,
            month,
            assignments: pendingChanges.map((change) => ({
              categoryId: change.categoryId,
              assigned: change.finalAssigned,
            })),
          })
          .catch((error) => {
            console.error("Failed to flush pending Budget assignments.", error);
          });
      }
    };
  }, [budgetId, budgetViewPersistence, month]);

  useEffect(() =>
    registerBudgetUndoRedoContext(`${budgetId}:${month}`, {
      getBudgetMonthView(requestedMonth) {
        return budgetViewPersistence.getBudgetMonthView({
          budgetId,
          month: requestedMonth,
        });
      },
      async setCategoryAssignedValues({ month: requestedMonth, assignments }) {
        const workspaceIdentity = `${budgetId}:${requestedMonth}`;
        const nextData = await budgetViewPersistence.setCategoryAssignedValues({
          budgetId,
          month: requestedMonth,
          assignments,
        });

        if (isWorkspaceCurrent(workspaceIdentity)) {
          setEditedData(nextData);
        }

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
    const workspaceIdentity = workspaceIdentityRef.current;
    if (assignmentEditTimerRef.current) {
      clearTimeout(assignmentEditTimerRef.current);
      assignmentEditTimerRef.current = null;
    }

    const changes = assignmentEditSessionRef.current.consume();
    if (changes.length === 0) {
      return;
    }

    const result = await executeUndoableBudgetAssignmentChanges({ month, changes });
    if (!result.performed && isWorkspaceCurrent(workspaceIdentity)) {
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
    const workspaceIdentity = workspaceIdentityRef.current;
    const requestVersion = ++activityRequestVersionRef.current;
    setSaveError(null);
    setIsActivityDrilldownLoading(true);

    void categoriesPersistence
      .getCategoryActivityDrilldown({
        budgetId,
        month,
        categoryId,
      })
      .then((drilldown) => {
        if (
          isWorkspaceCurrent(workspaceIdentity) &&
          activityRequestVersionRef.current === requestVersion
        ) {
          setActivityDrilldown(drilldown);
        }
      })
      .catch((error) => {
        if (
          !isWorkspaceCurrent(workspaceIdentity) ||
          activityRequestVersionRef.current !== requestVersion
        ) {
          return;
        }

        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to load category activity.",
        );
        setActivityDrilldown(null);
      })
      .finally(() => {
        if (
          isWorkspaceCurrent(workspaceIdentity) &&
          activityRequestVersionRef.current === requestVersion
        ) {
          setIsActivityDrilldownLoading(false);
        }
      });
  }

  function closeActivityDrilldown() {
    activityRequestVersionRef.current += 1;
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

  function runWorkspaceMutation(
    action: () => Promise<BudgetMonthView>,
    onSuccess: (nextData: BudgetMonthView) => void,
    fallbackError: string,
  ) {
    const workspaceIdentity = workspaceIdentityRef.current;
    const mutationVersion = ++mutationVersionRef.current;
    setSaveError(null);

    void action()
      .then((nextData) => {
        if (
          isWorkspaceCurrent(workspaceIdentity) &&
          mutationVersionRef.current === mutationVersion
        ) {
          onSuccess(nextData);
        }
      })
      .catch((error) => {
        if (
          !isWorkspaceCurrent(workspaceIdentity) ||
          mutationVersionRef.current !== mutationVersion
        ) {
          return;
        }

        setSaveError(error instanceof Error ? error.message : fallbackError);
      });
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

    const workspaceIdentity = workspaceIdentityRef.current;
    const mutationVersion = ++mutationVersionRef.current;

    void executeUndoableBudgetMoneyMovement({
      month,
      sourceCategoryId: input.coveringCategoryId,
      destinationCategoryId: input.overspentCategoryId,
      amount: input.amount,
    }).then((result) => {
      if (
        !isWorkspaceCurrent(workspaceIdentity) ||
        mutationVersionRef.current !== mutationVersion
      ) {
        return;
      }

      if (result.performed) {
        setSelectedCategoryId(input.overspentCategoryId);
        return;
      }

      setSaveError(result.error ?? "Failed to cover overspending.");
    });
  }

  function renameCategory(categoryId: string, name: string) {
    runWorkspaceMutation(
      () => categoriesPersistence.renameCategory({ budgetId, month, categoryId, name }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to rename category.",
    );
  }

  function setCategoryArchived(categoryId: string, isArchived: boolean) {
    runWorkspaceMutation(
      () => categoriesPersistence.setCategoryArchived({ budgetId, month, categoryId, isArchived }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to update category archive status.",
    );
  }

  function moveCategory(categoryId: string, direction: "up" | "down") {
    runWorkspaceMutation(
      () => categoriesPersistence.moveCategory({ budgetId, month, categoryId, direction }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to move category.",
    );
  }

  function moveCategoryToPosition(
    categoryId: string,
    targetCategoryId: string,
    placement: "before" | "after",
  ) {
    runWorkspaceMutation(
      () => categoriesPersistence.moveCategoryToPosition({
        budgetId,
        month,
        categoryId,
        targetCategoryId,
        placement,
      }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to move category.",
    );
  }

  function moveCategoryGroup(groupId: string, direction: "up" | "down") {
    runWorkspaceMutation(
      () => categoriesPersistence.moveCategoryGroup({ budgetId, month, groupId, direction }),
      (nextData) => setEditedData(nextData),
      "Failed to move category group.",
    );
  }

  function moveCategoryGroupToPosition(
    groupId: string,
    targetGroupId: string,
    placement: "before" | "after",
  ) {
    runWorkspaceMutation(
      () => categoriesPersistence.moveCategoryGroupToPosition({
        budgetId,
        month,
        groupId,
        targetGroupId,
        placement,
      }),
      (nextData) => setEditedData(nextData),
      "Failed to move category group.",
    );
  }

  function updateCategoryNote(categoryId: string, note: string) {
    runWorkspaceMutation(
      () => categoriesPersistence.updateCategoryNote({ budgetId, month, categoryId, note }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to update category note.",
    );
  }

  function updateCategoryGroupNote(groupId: string, note: string) {
    runWorkspaceMutation(
      () => categoriesPersistence.updateCategoryGroupNote({ budgetId, month, groupId, note }),
      (nextData) => setEditedData(nextData),
      "Failed to update category group note.",
    );
  }

  function previewCategoryMerge(
    sourceCategoryId: string,
    targetCategoryId: string,
  ) {
    const workspaceIdentity = workspaceIdentityRef.current;
    const requestVersion = ++mergePreviewRequestVersionRef.current;
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
        if (
          isWorkspaceCurrent(workspaceIdentity) &&
          mergePreviewRequestVersionRef.current === requestVersion
        ) {
          setCategoryMergePreview(preview);
        }
      })
      .catch((error) => {
        if (
          !isWorkspaceCurrent(workspaceIdentity) ||
          mergePreviewRequestVersionRef.current !== requestVersion
        ) {
          return;
        }

        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to preview category merge.",
        );
        setCategoryMergePreview(null);
      })
      .finally(() => {
        if (
          isWorkspaceCurrent(workspaceIdentity) &&
          mergePreviewRequestVersionRef.current === requestVersion
        ) {
          setIsCategoryMergePreviewLoading(false);
        }
      });
  }

  function mergeCategory(sourceCategoryId: string, targetCategoryId: string) {
    runWorkspaceMutation(
      () => categoriesPersistence.mergeCategory({
        budgetId,
        month,
        sourceCategoryId,
        targetCategoryId,
      }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(targetCategoryId);
        setCategoryMergePreview(null);
      },
      "Failed to merge categories.",
    );
  }

  function clearCategoryMergePreview() {
    mergePreviewRequestVersionRef.current += 1;
    setCategoryMergePreview(null);
    setIsCategoryMergePreviewLoading(false);
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
