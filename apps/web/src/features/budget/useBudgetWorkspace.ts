import { useEffect, useMemo, useRef, useState } from "react";
import { getBudgetPersistenceProvider } from "../persistence";
import { useBudgetView } from "./useBudgetView";
import type {
  BudgetActivityDrilldown,
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
  CategoryMergePreview,
  OverspendingHandling,
} from "./budgetViewTypes";
import { isMoneyNegative } from "./moneyMath";
import { createBudgetAssignmentEditSession } from "./budgetAssignmentEditing";
import {
  executeApplicationBudgetAssignmentChanges,
  executeApplicationBudgetMoneyMovementFromMultipleSources,
} from "./budgetApplicationHistory";
import { applicationHistory } from "../history";
import { previewCategoryAssignment } from "./budgetAssignmentPreview";
import { useCategoryHistory } from "./useCategoryHistory";
import {
  applyGoalRecommendedAssignment,
  type GoalRecommendedAssignmentResult,
} from "./goalRecommendedAssignment";
import type { UndoRedoResult } from "../history";
import { getPersistenceChangeVersion } from "../persistence/persistenceChangeBus";

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
  assignGoalRecommendation: (categoryId: string) => Promise<GoalRecommendedAssignmentResult>;
  setCategoryOverspendingHandling: (categoryId: string, overspendingHandling: OverspendingHandling) => void;
  coverOverspending: (input: {
    overspentCategoryId: string;
    sources: {
      categoryId: string;
      amount: number;
    }[];
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
  createCategory: (input: { name: string; groupId: string; groupName: string }) => Promise<void>;
}

export function resolveBudgetWorkspaceData(
  editedData: { data: BudgetMonthView; persistenceVersion: number } | null,
  authoritativeData: BudgetMonthView | null,
  authoritativeDataVersion: number,
): BudgetMonthView | null {
  return editedData && editedData.persistenceVersion >= authoritativeDataVersion
    ? editedData.data
    : authoritativeData;
}

export function resolveActiveCategorySelection(
  selectedCategoryId: string | null,
  data: BudgetMonthView,
  preferredCategoryId?: string,
): string | null {
  const activeCategoryIds = new Set(
    data.categoryGroups.flatMap((group) =>
      group.categories
        .filter((category) => !category.isArchived)
        .map((category) => category.id),
    ),
  );

  if (preferredCategoryId !== undefined) {
    return activeCategoryIds.has(preferredCategoryId)
      ? preferredCategoryId
      : null;
  }

  return selectedCategoryId !== null && activeCategoryIds.has(selectedCategoryId)
    ? selectedCategoryId
    : null;
}

export function useBudgetWorkspace(
  budgetId: string,
  month: string,
): UseBudgetWorkspaceState {
  const persistenceGateway = getBudgetPersistenceProvider();
  const categoriesPersistence = persistenceGateway.categories;
  const categoryHistory = useCategoryHistory(budgetId, month);
  const budgetViewPersistence = persistenceGateway.budgetView;
  const budgetView = useBudgetView(budgetId, month);
  const [editedData, setEditedDataState] = useState<{
    data: BudgetMonthView;
    persistenceVersion: number;
  } | null>(null);
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
  const goalRecommendationBusyRef = useRef(false);

  workspaceIdentityRef.current = `${budgetId}:${month}`;

  function setEditedData(nextData: BudgetMonthView | null): void {
    setEditedDataState(nextData ? {
      data: nextData,
      persistenceVersion: getPersistenceChangeVersion(),
    } : null);
  }

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
        void executeApplicationBudgetAssignmentChanges(budgetId, {
          month,
          changes: pendingChanges,
        }).then((result) => {
          if (!result.performed) {
            console.error(
              "Failed to flush pending Budget assignments.",
              result.error ?? result.reason,
            );
          }
        });
      }
    };
  }, [budgetId, budgetViewPersistence, month]);

  useEffect(
    () => applicationHistory.registerPendingEditFlush(
      budgetId,
      async () => { await flushPendingAssignmentEdits(); },
    ),
    [budgetId, month],
  );

  useEffect(() => {
    setEditedData(null);
    setSaveError(null);
    setLastEditedCategoryId(null);
    setCategoryMergePreview(null);
    setIsCategoryMergePreviewLoading(false);
    setActivityDrilldown(null);
    setIsActivityDrilldownLoading(false);
  }, [budgetId, month]);

  const data = resolveBudgetWorkspaceData(editedData, budgetView.data, budgetView.dataVersion);
  dataRef.current = data;

  async function flushPendingAssignmentEdits(reportError = true): Promise<UndoRedoResult | null> {
    const workspaceIdentity = workspaceIdentityRef.current;
    if (assignmentEditTimerRef.current) {
      clearTimeout(assignmentEditTimerRef.current);
      assignmentEditTimerRef.current = null;
    }

    const changes = assignmentEditSessionRef.current.consume();
    if (changes.length === 0) {
      return null;
    }

    const result = await executeApplicationBudgetAssignmentChanges(budgetId, { month, changes });
    if (reportError && !result.performed && isWorkspaceCurrent(workspaceIdentity)) {
      setSaveError(result.error ?? "Failed to save budget assignment changes.");
    }
    return result;
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

    // Apply the same bounded assignment projection used by the budget command
    // layer so direct consequences render immediately. SQLite still commits,
    // validates and replaces this optimistic view with the authoritative one.
    setEditedData(previewCategoryAssignment(currentData, categoryId, assigned));

    if (assignmentEditTimerRef.current) {
      clearTimeout(assignmentEditTimerRef.current);
    }

    assignmentEditTimerRef.current = setTimeout(() => {
      void flushPendingAssignmentEdits();
    }, 75);
  }

  async function assignGoalRecommendation(categoryId: string): Promise<GoalRecommendedAssignmentResult> {
    if (goalRecommendationBusyRef.current) {
      return { performed: false, reason: "busy" };
    }

    goalRecommendationBusyRef.current = true;
    const workspaceIdentity = workspaceIdentityRef.current;
    try {
      const result = await applyGoalRecommendedAssignment(
        { categoryId, month },
        {
          flushPendingAssignments: () => flushPendingAssignmentEdits(false),
          readBudgetView: () => budgetViewPersistence.getBudgetMonthView({ budgetId, month }),
          executeAssignment: (input) => executeApplicationBudgetAssignmentChanges(budgetId, input),
        },
      );
      if (result.performed && isWorkspaceCurrent(workspaceIdentity)) {
        setEditedData(result.view);
        setLastEditedCategoryId(categoryId);
      }
      return result;
    } catch (error) {
      return {
        performed: false,
        reason: "failed",
        error: error instanceof Error ? error.message : "Failed to apply the recommended assignment.",
      };
    } finally {
      goalRecommendationBusyRef.current = false;
    }
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

  function setCategoryOverspendingHandling(
    categoryId: string,
    overspendingHandling: OverspendingHandling,
  ) {
    runWorkspaceMutation(
      () => categoryHistory.setCategoryOverspendingHandling({
        categoryId,
        overspendingHandling,
      }),
      (nextData) => setEditedData(nextData),
      "Failed to update overspending handling.",
    );
  }

  function coverOverspending(input: {
    overspentCategoryId: string;
    sources: {
      categoryId: string;
      amount: number;
    }[];
  }) {
    setLastEditedCategoryId(input.overspentCategoryId);
    setSaveError(null);

    const categories =
      data?.categoryGroups.flatMap((group) => group.categories) ?? [];
    const overspentCategory = categories.find(
      (category) => category.id === input.overspentCategoryId,
    );

    if (!overspentCategory) {
      setSaveError("Unable to find the overspent category.");
      return;
    }

    const overspentAmount = Math.abs(Math.min(0, overspentCategory.available));

    if (overspentAmount <= 0) {
      setSaveError("Category is no longer overspent.");
      return;
    }

    if (input.sources.length === 0) {
      setSaveError("Choose at least one category to cover overspending.");
      return;
    }

    let total = 0;
    const seenCategoryIds = new Set<string>();

    for (const source of input.sources) {
      if (seenCategoryIds.has(source.categoryId)) {
        setSaveError("A covering category was selected more than once.");
        return;
      }
      seenCategoryIds.add(source.categoryId);

      const category = categories.find(
        (candidate) => candidate.id === source.categoryId,
      );

      if (!category) {
        setSaveError("Unable to find a covering category.");
        return;
      }

      if (!Number.isFinite(source.amount) || source.amount <= 0) {
        setSaveError("Cover amounts must be positive.");
        return;
      }

      if (category.available < source.amount) {
        setSaveError(
          `${category.name} has insufficient available funds.`,
        );
        return;
      }

      total += source.amount;
    }

    if (total > overspentAmount + 0.000001) {
      setSaveError("Cover amount cannot exceed the current overspending.");
      return;
    }

    const workspaceIdentity = workspaceIdentityRef.current;
    const mutationVersion = ++mutationVersionRef.current;

    void executeApplicationBudgetMoneyMovementFromMultipleSources(budgetId, {
      month,
      destinationCategoryId: input.overspentCategoryId,
      sources: input.sources,
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
      () => categoryHistory.renameCategory({ categoryId, name }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to rename category.",
    );
  }

  function setCategoryArchived(categoryId: string, isArchived: boolean) {
    runWorkspaceMutation(
      () => categoryHistory.setCategoryArchived({ categoryId, isArchived }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId((current) =>
          resolveActiveCategorySelection(current, nextData),
        );
      },
      "Failed to update category archive status.",
    );
  }

  function moveCategory(categoryId: string, direction: "up" | "down") {
    runWorkspaceMutation(
      () => categoryHistory.moveCategory({ categoryId, direction }),
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
      () => categoryHistory.moveCategoryToPosition({
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
      () => categoryHistory.moveCategoryGroup({ groupId, direction }),
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
      () => categoryHistory.moveCategoryGroupToPosition({
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
      () => categoryHistory.updateCategoryNote({ categoryId, note }),
      (nextData) => {
        setEditedData(nextData);
        setSelectedCategoryId(categoryId);
      },
      "Failed to update category note.",
    );
  }

  function updateCategoryGroupNote(groupId: string, note: string) {
    runWorkspaceMutation(
      () => categoryHistory.updateCategoryGroupNote({ groupId, note }),
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
        setSelectedCategoryId((current) =>
          resolveActiveCategorySelection(current, nextData, targetCategoryId),
        );
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

  async function createCategory(input: {
    name: string;
    groupId: string;
    groupName: string;
  }) {
    const nextView = await categoryHistory.createCategory(input);
    setEditedData(nextView);
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
    assignGoalRecommendation,
    setCategoryOverspendingHandling,
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
    createCategory,
  };
}
