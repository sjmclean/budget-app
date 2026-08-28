import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Card } from "../components/ui/Card";
import { getBudgetPersistenceProvider } from "../features/persistence";
import type {
  PayeeImportRuleView,
  PayeeRuleMatchType,
  PayeeView,
} from "../features/accounts/payeeService";
import { usePayeeHistory } from "../features/accounts/usePayeeHistory";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";
import { confirmDialog } from "../features/ui/appDialogService";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../features/budget/budgetMonthNavigation";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import {
  arePayeeNamesStrictlyEquivalent,
  buildDuplicateGroupSuppressions,
  findPossibleDuplicateGroups,
  proposeRecognitionRuleForDuplicate,
  getPayeeDeleteEligibility,
  normalisePayeeIdentity,
  type PossibleDuplicateSuppression,
} from "../features/accounts/payeeRecognition";
import {
  createPayeeMergeSelection,
  getPayeeMergeParticipantIds,
  switchPayeeMergeTarget,
} from "../features/accounts/payeeMergeSelection";
import { PayeeIcon } from "../features/icons/PayeeIcon";
import {
  PAYEE_BUILTIN_ICONS,
  serialisePayeeIconReference,
} from "../features/icons/payeeIconReference";

const COMPACT_PAYEE_LIMIT = 10;
type PayeeDetailTab = "overview" | "aliases" | "rules" | "transactions" | "scheduled" | "history";

const ruleTypeLabels: Record<PayeeRuleMatchType, string> = {
  equals: "Equals",
  contains: "Contains",
  startsWith: "Starts with",
  endsWith: "Ends with",
};

function formatDate(value: string): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function createDraftRule(payeeName = ""): PayeeImportRuleView {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    matchType: "contains",
    text: payeeName,
  };
}

function suppressionStorageKey(budgetId: string | null): string {
  return `budget-app.payee-duplicate-suppressions.v1:${budgetId ?? "unscoped"}`;
}

function readDuplicateSuppressions(budgetId: string | null): PossibleDuplicateSuppression[] {
  try {
    const value = window.localStorage.getItem(suppressionStorageKey(budgetId));
    return value ? JSON.parse(value) as PossibleDuplicateSuppression[] : [];
  } catch { return []; }
}

function writeDuplicateSuppressions(
  budgetId: string | null,
  suppressions: readonly PossibleDuplicateSuppression[],
) {
  window.localStorage.setItem(suppressionStorageKey(budgetId), JSON.stringify(suppressions));
}

const payeeDragIdPrefix = "payee-drag:";
const payeeDropIdPrefix = "payee-drop:";

function getPayeeDragId(payeeId: string): string {
  return `${payeeDragIdPrefix}${payeeId}`;
}

function getPayeeDropId(payeeId: string): string {
  return `${payeeDropIdPrefix}${payeeId}`;
}

function getPayeeIdFromDndId(id: string): string {
  if (id.startsWith(payeeDragIdPrefix)) {
    return id.slice(payeeDragIdPrefix.length);
  }

  if (id.startsWith(payeeDropIdPrefix)) {
    return id.slice(payeeDropIdPrefix.length);
  }

  return id;
}

function PayeeMergeListItem({
  payee,
  isSelected,
  isChecked,
  isDropTarget,
  isDragSource,
  disabled,
  onSelect,
  onToggleMergeSelection,
}: {
  payee: PayeeView;
  isSelected: boolean;
  isChecked: boolean;
  isDropTarget: boolean;
  isDragSource: boolean;
  disabled: boolean;
  onSelect: (payee: PayeeView, event: MouseEvent<HTMLButtonElement>) => void;
  onToggleMergeSelection: (payeeId: string, checked: boolean) => void;
}) {
  return (
    <div
      className={[
        "payee-management-list-item-shell",
        isSelected ? "payee-management-list-item-shell-selected" : "",
        isChecked ? "payee-management-list-item-shell-checked" : "",
        isDropTarget ? "payee-management-list-item-shell-drop-target" : "",
        isDragSource
          ? "payee-management-list-item-shell-dragging"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={!disabled ? "Select this payee for merging" : undefined}
    >
      {!disabled ? (
        <input
          type="checkbox"
          checked={isChecked}
          aria-label={`Select ${payee.name} for merge`}
          onChange={(event) =>
            onToggleMergeSelection(payee.id, event.currentTarget.checked)
          }
        />
      ) : null}
      <button
        className="payee-management-list-item"
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={(event) => onSelect(payee, event)}
      >
        <PayeeIcon payee={payee} size={32} decorative />
        <span className="payee-list-copy"><strong>{payee.name}</strong>
        <span>{payee.useCount} transactions</span>
        {isDropTarget ? (
          <small className="payee-merge-badge">
            Canonical payee
          </small>
        ) : isChecked ? (
          <small className="payee-merge-badge">Selected · drag to merge</small>
        ) : payee.defaultCategoryName ? (
          <small title={payee.defaultCategoryName}>
            {payee.defaultCategoryName}
          </small>
        ) : payee.note?.trim() ? (
          <small title={payee.note}>Has note</small>
        ) : null}</span>
      </button>
    </div>
  );
}

function PayeeMergeDragOverlay({
  sourcePayees,
}: {
  sourcePayees: PayeeView[];
}) {
  if (sourcePayees.length === 0) {
    return null;
  }

  const [primaryPayee] = sourcePayees;
  const transactionCount = sourcePayees.reduce(
    (total, payee) => total + payee.useCount,
    0,
  );

  return (
    <div className="payee-merge-drag-overlay">
      <strong>
        {sourcePayees.length === 1
          ? primaryPayee.name
          : `${sourcePayees.length} payees selected`}
      </strong>
      <span>{transactionCount} transactions</span>
      <small>Drop onto the payee you want to keep</small>
    </div>
  );
}

export function PayeeManagementPage() {
  const persistenceGateway = getBudgetPersistenceProvider();
  const payeesPersistence = persistenceGateway.payees;
  const budgetViewPersistence = persistenceGateway.budgetView;
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const [payees, setPayees] = useState<PayeeView[]>([]);
  const [archivedPayees, setArchivedPayees] = useState<PayeeView[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<
    BudgetCategoryOption[]
  >([]);
  const [showArchived, setShowArchived] = useState(false);
  const [listFilter, setListFilter] = useState<"all" | "duplicates" | "no-category" | "archived">("all");
  const [search, setSearch] = useState("");
  const [showAllPayees, setShowAllPayees] = useState(false);
  const [detailTab, setDetailTab] = useState<PayeeDetailTab>("overview");
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftDefaultCategoryId, setDraftDefaultCategoryId] = useState("");
  const [draftRules, setDraftRules] = useState<PayeeImportRuleView[]>([]);
  const [draftAliases, setDraftAliases] = useState<Array<{ id: string; value: string }>>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Select a payee to edit it.",
  );
  const [selectedMergePayeeIds, setSelectedMergePayeeIds] = useState<string[]>(
    [],
  );
  const [mergeTargetPayeeId, setMergeTargetPayeeId] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<"closed" | "rename" | "alias" | "rule">("closed");
  const [actionValue, setActionValue] = useState("");
  const [actionRuleType, setActionRuleType] = useState<PayeeRuleMatchType>("contains");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconPickerDraft, setIconPickerDraft] = useState("");
  const [mergeDialogStep, setMergeDialogStep] = useState<"closed" | "confirm" | "select" | "options" | "preview" | "complete">("closed");
  const [isMergeSubmitting, setIsMergeSubmitting] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [updateLinkedTransactions, setUpdateLinkedTransactions] = useState(true);
  const [updateScheduledTransactions, setUpdateScheduledTransactions] = useState(true);
  const [addMergedAliases, setAddMergedAliases] = useState(true);
  const [redirectRecognitionRules, setRedirectRecognitionRules] = useState(true);
  const [lastSelectedMergePayeeId, setLastSelectedMergePayeeId] = useState<
    string | null
  >(null);
  const [draggedMergePayeeId, setDraggedMergePayeeId] = useState<string | null>(
    null,
  );
  const [mergeDropTargetPayeeId, setMergeDropTargetPayeeId] = useState<
    string | null
  >(null);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);
  const payeeHistory = usePayeeHistory(activeBudgetId);
  const [duplicateSuppressions, setDuplicateSuppressions] = useState<PossibleDuplicateSuppression[]>([]);
  const [selectedDuplicateGroupId, setSelectedDuplicateGroupId] = useState<string | null>(null);
  const [selectedDuplicateMemberIds, setSelectedDuplicateMemberIds] = useState<string[]>([]);
  const duplicateReviewRef = useRef<HTMLDivElement | null>(null);
  const [duplicateMergeEvidence, setDuplicateMergeEvidence] = useState<{
    canonicalPayeeId: string; candidatePayeeId: string; matchedText: string;
  } | null>(null);
  const [mergeRecognitionProposal, setMergeRecognitionProposal] = useState<{
    targetPayeeId: string; targetName: string; text: string;
    state: "available" | "existing" | "conflict";
  } | null>(null);
  const [createRecognitionRuleAfterMerge, setCreateRecognitionRuleAfterMerge] = useState(false);

  function openMergeDialog() {
    if (!selectedPayee) return;
    setSelectedMergePayeeIds([]);
    setMergeTargetPayeeId(selectedPayee.id);
    setMergeSearch("");
    setMergeError("");
    setMergeDialogStep("confirm");
    setIsActionsOpen(false);
  }

  function openActionDialog(kind: "rename" | "alias" | "rule") {
    if (!selectedPayee) return;
    setActionDialog(kind);
    setActionValue(kind === "rename" ? selectedPayee.name : "");
    setActionRuleType("contains");
    setIsActionsOpen(false);
  }

  useEffect(() => {
    let active = true;

    const load = async () => {
      const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);
      return Promise.all([
      hosted
        ? persistenceGateway.accountRegisterQueries!.listPayees(activeBudgetId!, false)
        : payeesPersistence.listPayees(),
      hosted
        ? persistenceGateway.accountRegisterQueries!.listPayees(activeBudgetId!, true)
        : payeesPersistence.listArchivedPayees(),
      (() => {
        const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);

        if (!activeBudgetId) {
          return Promise.resolve([]);
        }

        return budgetViewPersistence.getCategoryOptions({
          budgetId: activeBudgetId,
          month: getCurrentBudgetMonth(),
        });
      })(),
      hosted && persistenceGateway.accountRegisterQueries!.listPayeeDuplicateSuppressions
        ? persistenceGateway.accountRegisterQueries!.listPayeeDuplicateSuppressions(activeBudgetId!)
        : Promise.resolve(readDuplicateSuppressions(activeBudgetId)),
    ]);
    };
    void load().then(([loadedPayees, loadedArchivedPayees, loadedCategoryOptions, loadedSuppressions]) => {
      if (!active) {
        return;
      }

      setPayees([...loadedPayees]);
      setArchivedPayees([...loadedArchivedPayees]);
      setCategoryOptions(loadedCategoryOptions);
      setDuplicateSuppressions([...loadedSuppressions]);
      setSelectedPayeeId(
        (currentPayeeId) => currentPayeeId ?? loadedPayees[0]?.id ?? null,
      );
    });

    return () => {
      active = false;
    };
  }, [budgetViewPersistence, budgets, payeesPersistence, selectedBudgetId]);

  const duplicateGroups = useMemo(
    () => findPossibleDuplicateGroups(payees, duplicateSuppressions),
    [payees, duplicateSuppressions],
  );
  const isStrictEquivalentDuplicateGroup = (
    group: (typeof duplicateGroups)[number],
  ) =>
    group.payees.every(({ name }) =>
      arePayeeNamesStrictlyEquivalent(group.anchorPayee.name, name),
    );

  const highConfidenceDuplicateCount = duplicateGroups.filter(
    isStrictEquivalentDuplicateGroup,
  ).length;

  const filteredDuplicateGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchingGroups = query
      ? duplicateGroups.filter(({ payees: members }) =>
          members.some(({ name }) =>
            name.toLocaleLowerCase().includes(query),
          ),
        )
      : [...duplicateGroups];

    return [...matchingGroups].sort((left, right) => {
      const confidenceDifference =
        Number(isStrictEquivalentDuplicateGroup(right)) -
        Number(isStrictEquivalentDuplicateGroup(left));

      return confidenceDifference;
    });
  }, [duplicateGroups, search]);
  const selectedDuplicateGroup = duplicateGroups.find(({ id }) => id === selectedDuplicateGroupId) ??
    filteredDuplicateGroups[0] ?? null;

  const selectedDuplicateGroupHasStrictEquivalentNames =
    Boolean(
      selectedDuplicateGroup &&
      isStrictEquivalentDuplicateGroup(selectedDuplicateGroup),
    );

  useEffect(() => {
    if (listFilter !== "duplicates" || !selectedDuplicateGroupId) {
      return;
    }

    duplicateReviewRef.current?.scrollIntoView({
      block: "start",
    });
  }, [listFilter, selectedDuplicateGroupId]);
  const visiblePayees = listFilter === "archived" || showArchived
    ? archivedPayees
    : listFilter === "no-category"
        ? payees.filter((payee) => !payee.defaultCategoryId)
        : payees;

  const filteredPayees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) {
      return visiblePayees;
    }

    return visiblePayees.filter((payee) =>
      payee.name.toLocaleLowerCase().includes(query),
    );
  }, [visiblePayees, search]);

  const directoryPayees = useMemo(() => {
    if (search.trim() || showAllPayees) {
      return filteredPayees;
    }

    return [...filteredPayees]
      .sort((left, right) => {
        if (left.id === selectedPayeeId) return -1;
        if (right.id === selectedPayeeId) return 1;
        return right.useCount - left.useCount ||
          (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? "") ||
          left.name.localeCompare(right.name);
      })
      .slice(0, COMPACT_PAYEE_LIMIT);
  }, [filteredPayees, search, selectedPayeeId, showAllPayees]);

  useEffect(() => {
    setShowAllPayees(false);
  }, [search, listFilter, showArchived]);

  useEffect(() => {
    if (!selectedDuplicateGroup) return;
    setSelectedDuplicateGroupId(selectedDuplicateGroup.id);
    setSelectedDuplicateMemberIds(selectedDuplicateGroup.payees.map(({ id }) => id));
  }, [selectedDuplicateGroup?.id]);

  const selectedPayee =
    visiblePayees.find((payee) => payee.id === selectedPayeeId) ??
    filteredPayees[0] ??
    null;

  useEffect(() => {
    setDraftName(selectedPayee?.name ?? "");
    setDraftNote(selectedPayee?.note ?? "");
    setDraftDefaultCategoryId(selectedPayee?.defaultCategoryId ?? "");
    setDraftRules(selectedPayee?.importRules ?? []);
    setDraftAliases(selectedPayee?.aliases ?? []);
    setMergeDropTargetPayeeId(null);
    setDetailTab("overview");
  }, [
    selectedPayee?.id,
    selectedPayee?.name,
    selectedPayee?.note,
    selectedPayee?.defaultCategoryId,
    selectedPayee?.importRules,
    selectedPayee?.aliases,
  ]);

  function openIconPicker() {
    setIconPickerDraft(selectedPayee?.iconRef ?? "");
    setIsIconPickerOpen(true);
  }

  async function saveIconSelection() {
    if (!selectedPayee) return;
    const update = {
      id: selectedPayee.id,
      name: selectedPayee.name,
      note: selectedPayee.note ?? "",
      defaultCategoryId: selectedPayee.defaultCategoryId ?? "",
      defaultCategoryName: selectedPayee.defaultCategoryName ?? "",
      importRules: selectedPayee.importRules ?? [],
      aliases: selectedPayee.aliases ?? [],
      iconUpdate: iconPickerDraft
        ? { kind: "set" as const, iconRef: iconPickerDraft }
        : { kind: "automatic" as const },
    };
    const nextPayees = activeBudgetId && persistenceGateway.accountRegisterQueries
      ? await payeeHistory.updatePayee(update)
      : await payeesPersistence.updatePayee(update);
    setPayees(nextPayees);
    setIsIconPickerOpen(false);
    setStatusMessage(iconPickerDraft ? "Payee icon saved." : "Payee icon reset to Automatic.");
  }

  const selectedCategory = categoryOptions.find(
    (category) => category.id === draftDefaultCategoryId,
  );

  const selectedMergePayees = payees.filter((payee) =>
    selectedMergePayeeIds.includes(payee.id),
  );
  const orderedSelectedMergePayees = getPayeeMergeParticipantIds(
    selectedMergePayeeIds,
    mergeTargetPayeeId,
  )
    .map((payeeId) => payees.find((payee) => payee.id === payeeId))
    .filter((payee): payee is PayeeView => Boolean(payee));
  const selectedMergeTransactionCount = selectedMergePayees.reduce(
    (total, payee) => total + payee.useCount,
    0,
  );
  const selectedMergeRuleCount = selectedMergePayees.reduce(
    (total, payee) => total + (payee.importRules?.length ?? 0),
    0,
  );
  const selectedMergeNoteCount = selectedMergePayees.filter((payee) =>
    payee.note?.trim(),
  ).length;
  const mergeCandidates = payees.filter((payee) =>
    payee.id !== selectedPayee?.id &&
    payee.name.toLocaleLowerCase().includes(mergeSearch.trim().toLocaleLowerCase()),
  );
  const mergeScheduledCount = selectedMergePayees.reduce(
    (total, payee) => total + (payee.scheduledUseCount ?? 0),
    0,
  );
  const mergeTargetPayee = payees.find((payee) => payee.id === mergeTargetPayeeId) ?? selectedPayee;

  function chooseMergeTarget(payeeId: string) {
    const nextSelection = switchPayeeMergeTarget(
      selectedMergePayeeIds,
      mergeTargetPayeeId,
      payeeId,
    );
    setSelectedMergePayeeIds(nextSelection.sourcePayeeIds);
    setMergeTargetPayeeId(nextSelection.targetPayeeId);
  }

  const hasUnsavedChanges =
    Boolean(selectedPayee) &&
    (draftName.trim() !== selectedPayee?.name ||
      draftNote.trim() !== (selectedPayee?.note ?? "") ||
      draftDefaultCategoryId !== (selectedPayee?.defaultCategoryId ?? "") ||
      JSON.stringify(normaliseRulesForComparison(draftRules)) !==
        JSON.stringify(
          normaliseRulesForComparison(selectedPayee?.importRules ?? []),
        ) ||
      JSON.stringify(draftAliases.map(({ value }) => value.trim()).filter(Boolean).sort()) !==
        JSON.stringify((selectedPayee?.aliases ?? []).map(({ value }) => value.trim()).filter(Boolean).sort()));

  async function saveSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const nextName = draftName.trim();

    if (!nextName) {
      setStatusMessage("Payee name is required.");
      return;
    }

    const nextRules = draftRules
      .map((rule) => ({ ...rule, text: rule.text.trim() }))
      .filter((rule) => rule.text.length > 0);

    const update = {
      id: selectedPayee.id,
      name: nextName,
      note: draftNote,
      defaultCategoryId: selectedCategory?.id ?? "",
      defaultCategoryName: selectedCategory
        ? `${selectedCategory.groupName}: ${selectedCategory.name}`
        : "",
      importRules: nextRules,
      aliases: draftAliases
        .map((alias) => ({ ...alias, value: alias.value.trim() }))
        .filter(({ value }) => value.length > 0),
    };
    const nextPayees =
      activeBudgetId && persistenceGateway.accountRegisterQueries
        ? await payeeHistory.updatePayee(update)
        : await payeesPersistence.updatePayee(update);

    setPayees(nextPayees);
    setStatusMessage(`Saved ${nextName}.`);

    const updatedPayee = nextPayees.find((payee) => payee.name === nextName);
    setSelectedPayeeId(updatedPayee?.id ?? selectedPayee.id);
  }

  async function saveActionDialog() {
    if (!selectedPayee || actionDialog === "closed") return;
    const value = actionValue.trim();
    if (!value) {
      setStatusMessage(actionDialog === "rename" ? "Payee name is required." : "Enter a value first.");
      return;
    }

    const update = {
      id: selectedPayee.id,
      name: actionDialog === "rename" ? value : selectedPayee.name,
      note: selectedPayee.note ?? "",
      defaultCategoryId: selectedPayee.defaultCategoryId ?? "",
      defaultCategoryName: selectedPayee.defaultCategoryName ?? "",
      aliases: actionDialog === "alias"
        ? [...(selectedPayee.aliases ?? []), { id: `alias-${Date.now()}`, value }]
        : selectedPayee.aliases ?? [],
      importRules: actionDialog === "rule"
        ? [...(selectedPayee.importRules ?? []), {
            id: `rule-${Date.now()}`,
            matchType: actionRuleType,
            text: value,
          }]
        : selectedPayee.importRules ?? [],
    };
    const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);
    const nextPayees = hosted
      ? await payeeHistory.updatePayee(update)
      : await payeesPersistence.updatePayee(update);
    setPayees(nextPayees);
    setSelectedPayeeId(selectedPayee.id);
    setActionDialog("closed");
    setStatusMessage(
      actionDialog === "rename"
        ? `Renamed payee to ${value} and updated linked transactions.`
        : actionDialog === "alias"
          ? `Added alias ${value}.`
          : `Added recognition rule for ${value}.`,
    );
  }

  async function archiveSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const shouldArchive = await confirmDialog({
      title: `Archive "${selectedPayee.name}"?`,
      message:
        "Archived payees are hidden from the active payee list but can be restored later.",
      confirmLabel: "Archive payee",
    });

    if (!shouldArchive) {
      return;
    }

    const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);
    const nextPayees = hosted
      ? await payeeHistory.setPayeeArchived(selectedPayee.id, true)
      : await payeesPersistence.archivePayee(selectedPayee.id);
    const nextArchivedPayees = hosted
      ? [...await persistenceGateway.accountRegisterQueries!.listPayees(activeBudgetId!, true)]
      : await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setSelectedPayeeId(nextPayees[0]?.id ?? null);
    setStatusMessage(`Archived ${selectedPayee.name}.`);
  }

  async function restoreSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);
    const nextPayees = hosted
      ? await payeeHistory.setPayeeArchived(selectedPayee.id, false)
      : await payeesPersistence.restorePayee(selectedPayee.id);
    const nextArchivedPayees = hosted
      ? [...await persistenceGateway.accountRegisterQueries!.listPayees(activeBudgetId!, true)]
      : await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setShowArchived(false);
    setSelectedPayeeId(selectedPayee.id);
    setStatusMessage(`Restored ${selectedPayee.name}.`);
  }

  async function deleteSelectedPayee() {
    if (!selectedPayee) return;
    const eligibility = getPayeeDeleteEligibility(selectedPayee);
    if (!eligibility.canDelete) {
      setStatusMessage("This payee is in use. Archive or merge it instead.");
      return;
    }
    const confirmed = await confirmDialog({
      title: `Delete payee "${selectedPayee.name}"?`,
      message: "This unused payee and its aliases will be permanently deleted.",
      confirmLabel: "Delete payee",
    });
    if (!confirmed) return;
    const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);
    const nextPayees = hosted && persistenceGateway.accountRegisterQueries!.deleteUnusedPayee
      ? await payeeHistory.deleteUnusedPayee(selectedPayee.id)
      : await payeesPersistence.deletePayee(selectedPayee.id);
    setPayees(nextPayees);
    setSelectedPayeeId(nextPayees[0]?.id ?? null);
    setStatusMessage(`Deleted ${selectedPayee.name}.`);
  }

  function selectPayeeForMerge(
    payee: PayeeView,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (showArchived) {
      selectPayee(payee);
      return;
    }

    if (event.shiftKey && lastSelectedMergePayeeId) {
      const startIndex = filteredPayees.findIndex(
        (item) => item.id === lastSelectedMergePayeeId,
      );
      const endIndex = filteredPayees.findIndex((item) => item.id === payee.id);

      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] =
          startIndex < endIndex
            ? [startIndex, endIndex]
            : [endIndex, startIndex];
        const rangeIds = filteredPayees
          .slice(from, to + 1)
          .map((item) => item.id);

        setSelectedMergePayeeIds((payeeIds) =>
          Array.from(new Set([...payeeIds, ...rangeIds])),
        );
        setLastSelectedMergePayeeId(payee.id);
        setStatusMessage(`${rangeIds.length} payees selected for merge.`);
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedMergePayeeIds((payeeIds) =>
        payeeIds.includes(payee.id)
          ? payeeIds.filter((id) => id !== payee.id)
          : [...payeeIds, payee.id],
      );
      setLastSelectedMergePayeeId(payee.id);
      setStatusMessage("Payee merge selection updated.");
      return;
    }

    setSelectedMergePayeeIds([payee.id]);
    setLastSelectedMergePayeeId(payee.id);
    selectPayee(payee);
  }

  function clearMergeSelection() {
    setSelectedMergePayeeIds([]);
    setMergeTargetPayeeId("");
    setLastSelectedMergePayeeId(null);
    setDraggedMergePayeeId(null);
    setMergeDropTargetPayeeId(null);
    setStatusMessage("Merge selection cleared.");
  }

  function toggleMergeSelection(payeeId: string, checked: boolean) {
    setSelectedMergePayeeIds((currentIds) =>
      checked
        ? Array.from(new Set([...currentIds, payeeId])).filter(
            (id) => id !== mergeTargetPayeeId,
          )
        : currentIds.filter((id) => id !== payeeId),
    );
    setStatusMessage(
      checked
        ? "Payee selected for merge."
        : "Payee removed from merge selection.",
    );
  }

  function previewSelectedMerge() {
    if (selectedMergePayeeIds.length < 1 || !mergeTargetPayeeId) {
      setStatusMessage("Select at least one payee to merge and choose the payee to keep.");
      return;
    }

    const targetPayee = payees.find((payee) => payee.id === mergeTargetPayeeId);
    const sourcePayeeId = selectedMergePayeeIds[0];
    if (targetPayee && sourcePayeeId) {
      void mergePayeesIntoTarget(targetPayee, sourcePayeeId);
    }
  }

  function reviewDuplicateMerge() {
    if (!selectedDuplicateGroup || selectedDuplicateMemberIds.length < 2) {
      setStatusMessage("Select at least two suggested payees to review a merge.");
      return;
    }
    const selectedMembers = selectedDuplicateGroup.payees.filter(({ id }) => selectedDuplicateMemberIds.includes(id));
    const mergeSelection = createPayeeMergeSelection(
      selectedMembers.map(({ id }) => id),
      selectedDuplicateGroup.anchorPayeeId,
    );
    setSelectedMergePayeeIds(mergeSelection.sourcePayeeIds);
    setMergeTargetPayeeId(mergeSelection.targetPayeeId);
    const selectedCandidateIds = new Set(selectedMembers.filter(({ id }) => id !== selectedDuplicateGroup.anchorPayeeId).map(({ id }) => id));
    const evidence = selectedDuplicateGroup.candidates.flatMap(({ payeeId, reasons }) =>
      selectedCandidateIds.has(payeeId) ? reasons : []).find((reason) =>
      reason.type === "canonical-name-contained" && reason.canonicalPayeeId &&
      reason.candidatePayeeId && reason.matchedText);
    setDuplicateMergeEvidence(evidence ? {
      canonicalPayeeId: evidence.canonicalPayeeId!, candidatePayeeId: evidence.candidatePayeeId!,
      matchedText: evidence.matchedText!,
    } : null);
    setMergeRecognitionProposal(null);
    setSelectedPayeeId(selectedDuplicateGroup.anchorPayeeId);
    setMergeSearch("");
    setMergeError("");
    setMergeDialogStep("confirm");
  }

  async function keepDuplicateMembersSeparate() {
    if (!selectedDuplicateGroup || selectedDuplicateMemberIds.length < 2) return;
    const additions: PossibleDuplicateSuppression[] = selectedDuplicateGroup.candidates
      .filter(({ payeeId }) => selectedDuplicateMemberIds.includes(payeeId))
      .map(({ payeeId }) => ({ leftPayeeId: selectedDuplicateGroup.anchorPayeeId, rightPayeeId: payeeId }));
    const existing = new Set(duplicateSuppressions.map(({ leftPayeeId, rightPayeeId }) => [leftPayeeId, rightPayeeId].sort().join(":")));
    const next = [...duplicateSuppressions, ...additions.filter(({ leftPayeeId, rightPayeeId }) =>
      !existing.has([leftPayeeId, rightPayeeId].sort().join(":")))];
    const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);
    if (hosted && persistenceGateway.accountRegisterQueries!.keepPayeesSeparate) {
      await payeeHistory.keepPayeesSeparate(additions);
    } else {
      writeDuplicateSuppressions(activeBudgetId, next);
    }
    setDuplicateSuppressions(next);
    setSelectedDuplicateGroupId(null);
    setStatusMessage("The selected payee relationships will no longer be suggested.");
  }

  async function ignoreDuplicateGroup() {
    if (!selectedDuplicateGroup) return;

    const additions = buildDuplicateGroupSuppressions(
      selectedDuplicateGroup.payees.map(({ id }) => id),
    );

    const existing = new Set(
      duplicateSuppressions.map(({ leftPayeeId, rightPayeeId }) =>
        [leftPayeeId, rightPayeeId].sort().join(":"),
      ),
    );

    const next = [
      ...duplicateSuppressions,
      ...additions.filter(({ leftPayeeId, rightPayeeId }) =>
        !existing.has([leftPayeeId, rightPayeeId].sort().join(":")),
      ),
    ];

    const hosted = Boolean(
      activeBudgetId && persistenceGateway.accountRegisterQueries,
    );

    if (
      hosted &&
      persistenceGateway.accountRegisterQueries!.keepPayeesSeparate
    ) {
      await payeeHistory.keepPayeesSeparate(additions);
    } else {
      writeDuplicateSuppressions(activeBudgetId, next);
    }

    setDuplicateSuppressions(next);
    setSelectedDuplicateGroupId(null);
    setStatusMessage(
      "This duplicate suggestion has been ignored and will stay hidden.",
    );
  }

  function getDragSourcePayees(payeeId: string): PayeeView[] {
    if (selectedMergePayeeIds.includes(payeeId)) {
      return payees.filter((payee) => selectedMergePayeeIds.includes(payee.id));
    }

    return payees.filter((payee) => payee.id === payeeId);
  }

  function endPayeeDrag() {
    setDraggedMergePayeeId(null);
    setMergeDropTargetPayeeId(null);
  }

  async function mergePayeesIntoTarget(
    targetPayee: PayeeView,
    sourcePayeeId: string,
    skipConfirmation = false,
  ) {
    const sourcePayees = getDragSourcePayees(sourcePayeeId).filter(
      (sourcePayee) => sourcePayee.id !== targetPayee.id,
    );

    if (sourcePayees.length === 0) {
      endPayeeDrag();
      return;
    }
    const recognitionEvidence = duplicateMergeEvidence &&
      duplicateMergeEvidence.canonicalPayeeId === targetPayee.id &&
      sourcePayees.some(({ id }) => id === duplicateMergeEvidence.candidatePayeeId)
      ? duplicateMergeEvidence : null;

    const transactionCount = sourcePayees.reduce(
      (total, payee) => total + payee.useCount,
      0,
    );
    const ruleCount = sourcePayees.reduce(
      (total, payee) => total + (payee.importRules?.length ?? 0),
      0,
    );
    const noteCount = sourcePayees.filter((payee) => payee.note?.trim()).length;
    const shouldMerge = skipConfirmation || await confirmDialog({
      title:
        sourcePayees.length === 1
          ? `Merge "${sourcePayees[0].name}" into "${targetPayee.name}"?`
          : `Merge ${sourcePayees.length} payees into "${targetPayee.name}"?`,
      message:
        `${transactionCount} transactions, ${ruleCount} import rules, and ${noteCount} notes ` +
        `will be folded into "${targetPayee.name}". Linked register transactions and scheduled ` +
        `transactions will be updated to use that payee. Source payees will be archived. ` +
        `Continue and update the linked transactions?`,
      confirmLabel: "Merge and update",
    });

    if (!shouldMerge) {
      endPayeeDrag();
      return;
    }

    let nextPayees = payees;
    const hosted = Boolean(activeBudgetId && persistenceGateway.accountRegisterQueries);

    const mergeInput = {
      sourcePayeeId: sourcePayees[0].id,
      sourcePayeeIds: sourcePayees.map((payee) => payee.id),
      targetPayeeId: targetPayee.id,
      updateLinkedTransactions: true,
      updateScheduledTransactions: true,
      addMergedAliases: true,
      redirectRecognitionRules: true,
    };
    nextPayees = hosted
      ? [...await persistenceGateway.accountRegisterQueries!.mergePayees(activeBudgetId!, mergeInput)]
      : await payeesPersistence.mergePayees(mergeInput);

    const nextArchivedPayees = hosted
      ? [...await persistenceGateway.accountRegisterQueries!.listPayees(activeBudgetId!, true)]
      : await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    const proposal = proposeRecognitionRuleForDuplicate(recognitionEvidence ? {
      type: "canonical-name-contained", value: recognitionEvidence.matchedText,
      canonicalPayeeId: recognitionEvidence.canonicalPayeeId,
      candidatePayeeId: recognitionEvidence.candidatePayeeId,
      matchedText: recognitionEvidence.matchedText,
    } : undefined, targetPayee.id, nextPayees);
    setMergeRecognitionProposal(proposal);
    setCreateRecognitionRuleAfterMerge(false);
    setArchivedPayees(nextArchivedPayees);
    setSelectedPayeeId(targetPayee.id);
    setSelectedMergePayeeIds([]);
    setLastSelectedMergePayeeId(null);
    setDraggedMergePayeeId(null);
    setMergeDropTargetPayeeId(null);
    setStatusMessage(
      sourcePayees.length === 1
        ? `Merged ${sourcePayees[0].name} into ${targetPayee.name}.`
        : `Merged ${sourcePayees.length} payees into ${targetPayee.name}.`,
    );
    setMergeDialogStep("closed");
    setSelectedDuplicateGroupId(null);
    setDuplicateMergeEvidence(null);
  }

  async function confirmSelectedMerge() {
    if (!mergeTargetPayee || selectedMergePayeeIds.length < 1 || isMergeSubmitting) return;
    const sourcePayeeId = selectedMergePayeeIds[0];
    if (!sourcePayeeId) return;
    setIsMergeSubmitting(true);
    setMergeError("");
    try {
      await mergePayeesIntoTarget(mergeTargetPayee, sourcePayeeId, true);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "The payees could not be merged.");
    } finally {
      setIsMergeSubmitting(false);
    }
  }

  async function executeMergePreview() { await confirmSelectedMerge(); }
  function finishMergeWorkflow() { setMergeDialogStep("closed"); }

  function selectPayee(payee: PayeeView) {
    setSelectedPayeeId(payee.id);
    setStatusMessage(`Editing ${payee.name}.`);
  }

  function updateRule(ruleId: string, updates: Partial<PayeeImportRuleView>) {
    setDraftRules((rules) =>
      rules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...updates } : rule,
      ),
    );
  }

  function removeRule(ruleId: string) {
    setDraftRules((rules) => rules.filter((rule) => rule.id !== ruleId));
  }

  function resetDrafts() {
    if (!selectedPayee) {
      return;
    }

    setDraftName(selectedPayee.name);
    setDraftNote(selectedPayee.note ?? "");
    setDraftDefaultCategoryId(selectedPayee.defaultCategoryId ?? "");
    setDraftRules(selectedPayee.importRules ?? []);
    setDraftAliases(selectedPayee.aliases ?? []);
    setStatusMessage("Changes reverted.");
  }

  return (
    <div
      className="page-stack payee-management-page"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clearMergeSelection();
        }
      }}
    >
      <div className="workspace-header">
        <div>
          <h1>Payee Management</h1>
          <p className="muted">
            Clean up payees created by manual entry and imports. Rename, add
            notes, set default categories, and prepare import rules.
          </p>
        </div>
      </div>

      <Card className="payee-management-workspace">
        <aside className="payee-management-list-panel">
          <input
            id="payee-management-search"
            className="payee-management-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search payees..."
          />

          <nav className="payee-management-filters payee-management-filters-primary" aria-label="Payee filters">
            {([
              ["all", "All Payees", payees.length],
              ["duplicates", "Possible Duplicates", duplicateGroups.length],
              ["no-category", "No Default Category", payees.filter((payee) => !payee.defaultCategoryId).length],
              ["archived", "Archived", archivedPayees.length],
            ] as const).map(([value, label, count]) => (
              <button key={value} type="button" className={listFilter === value ? "is-active" : ""}
                onClick={() => { setListFilter(value); setShowArchived(value === "archived"); setSelectedPayeeId(null); setSelectedDuplicateGroupId(null); }}>
                <span>{label}</span><strong>{count}</strong>
              </button>
            ))}
          </nav>

            {listFilter === "duplicates" ? (
              <>
                <p className="payee-duplicates-intro">
                  Showing groups of payees that may be the same.
                  {highConfidenceDuplicateCount > 0 ? (
                    <strong className="payee-duplicate-confidence-summary">
                      {highConfidenceDuplicateCount} high-confidence
                      {highConfidenceDuplicateCount === 1 ? " group" : " groups"}
                    </strong>
                  ) : (
                    <span className="payee-duplicate-confidence-summary">
                      No case/spacing-only matches found.
                    </span>
                  )}
                </p>
                <div className="payee-management-list payee-duplicate-group-list" role="listbox" aria-label="Possible duplicate groups">
                  {filteredDuplicateGroups.length > 0 ? filteredDuplicateGroups.map((group) => (
                    <button key={group.id} type="button"
                      className={`payee-duplicate-group-card${selectedDuplicateGroup?.id === group.id ? " is-active" : ""}`}
                      onClick={() => setSelectedDuplicateGroupId(group.id)}>
                      <span>
                        <strong>{group.payees[0].name}</strong>
                        {isStrictEquivalentDuplicateGroup(group) ? (
                          <em className="payee-duplicate-confidence-badge">
                            High confidence
                          </em>
                        ) : null}
                        <small>
                          {group.payees.length} similar payees ·{" "}
                          {group.payees.reduce(
                            (sum, payee) => sum + payee.useCount,
                            0,
                          )} transactions
                        </small>
                      </span>
                      <b>Review ›</b>
                    </button>
                  )) : (
                    <div className="payee-duplicate-empty"><strong>No possible duplicates found.</strong><span>We'll show payees here when their names or import patterns strongly suggest they may represent the same payee.</span></div>
                  )}
                </div>
              </>
            ) : (
            <div className="payee-management-list" role="listbox">
              {filteredPayees.length > 0 ? (
                directoryPayees.map((payee) => (
                  <PayeeMergeListItem
                    key={payee.id}
                    payee={payee}
                    isSelected={selectedPayee?.id === payee.id}
                    isChecked={false}
                    isDropTarget={mergeDropTargetPayeeId === payee.id}
                    isDragSource={Boolean(
                      draggedMergePayeeId &&
                      getDragSourcePayees(draggedMergePayeeId).some(
                        (sourcePayee) => sourcePayee.id === payee.id,
                      ),
                    )}
                    disabled={true}
                    onSelect={(item) => selectPayee(item)}
                    onToggleMergeSelection={toggleMergeSelection}
                  />
                ))
              ) : (
                <p className="payee-management-empty">No payees found.</p>
              )}
            </div>
            )}

          {listFilter !== "duplicates" && !search.trim() && filteredPayees.length > COMPACT_PAYEE_LIMIT ? (
            <button className="payee-show-all" type="button" onClick={() => setShowAllPayees((value) => !value)}>
              {showAllPayees ? "Show compact payee list" : `Show all ${filteredPayees.length} payees`}
            </button>
          ) : null}

          {false && !showArchived && selectedMergePayeeIds.length > 0 ? (
            <div className="payee-bulk-merge-bar" aria-label="Merge selected payees">
              <div>
                <strong>{selectedMergePayeeIds.length} selected</strong>
                <span>{selectedMergeTransactionCount} linked transactions</span>
              </div>
              <label className="field-label" htmlFor="payee-merge-target">
                Payee to keep
              </label>
              <select
                id="payee-merge-target"
                value={mergeTargetPayeeId}
                onChange={(event) => setMergeTargetPayeeId(event.target.value)}
              >
                {selectedMergePayeeIds.map((payeeId) => {
                  const payee = payees.find((item) => item.id === payeeId);
                  return payee ? (
                    <option key={payee.id} value={payee.id}>{payee.name}</option>
                  ) : null;
                })}
              </select>
              <div className="payee-bulk-merge-actions">
                <button className="button button-secondary" type="button" onClick={clearMergeSelection}>
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={selectedMergePayeeIds.length < 1}
                  onClick={previewSelectedMerge}
                >
                  Merge selected
                </button>
              </div>
            </div>
          ) : null}

          {false && !showArchived && selectedMergePayeeIds.length === 0 ? (
            <div className="payee-drag-merge-help">
              <strong>Merge payees</strong>
              <span>
                Tick one or more source payees, choose the payee to keep, then confirm
                how linked register and scheduled transactions should be updated.
                {selectedMergePayeeIds.length > 0
                  ? ` ${selectedMergePayeeIds.length} selected · ${selectedMergeTransactionCount} transactions.`
                  : ""}
              </span>
              {selectedPayee && selectedMergePayeeIds.some((id) => id !== selectedPayee.id) ? (
                <button className="button button-secondary" type="button"
                  onClick={() => void mergePayeesIntoTarget(
                    selectedPayee,
                    selectedMergePayeeIds.find((id) => id !== selectedPayee.id)!,
                  )}>
                  Preview merge into {selectedPayee.name}
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section className="payee-management-detail-panel">
          {listFilter === "duplicates" ? selectedDuplicateGroup ? (
            <div className="payee-duplicate-review" ref={duplicateReviewRef}>
              <header className="payee-duplicate-review-header">
                <div><h2>Possible Duplicate <small>Group {duplicateGroups.findIndex(({ id }) => id === selectedDuplicateGroup.id) + 1} of {duplicateGroups.length}</small></h2>
                  <p>These payees look similar. Review the details and decide what to do.</p></div>
              </header>
              {selectedDuplicateGroupHasStrictEquivalentNames ? (
                <div className="payee-duplicate-confidence" role="status">
                  <strong>High-confidence duplicate</strong>
                  <span>
                    These payee names differ only by capitalisation or spacing.
                  </span>
                </div>
              ) : null}
              <div className="payee-duplicate-members">
                {selectedDuplicateGroup.payees.map((payee, index) => (
                  <article key={payee.id} className="payee-duplicate-member">
                    <label><input type="checkbox" disabled={payee.id === selectedDuplicateGroup.anchorPayeeId} checked={selectedDuplicateMemberIds.includes(payee.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedDuplicateMemberIds((ids) => checked
                          ? [...new Set([...ids, payee.id])] : ids.filter((id) => id !== payee.id));
                      }} />
                      <strong>{payee.name}</strong>{index === 0 ? <em>Recommended</em> : null}</label>
                    <div className="payee-duplicate-stats">
                      <span><b>{payee.useCount}</b>Transactions</span><span><b>{payee.scheduledUseCount ?? 0}</b>Scheduled</span>
                      <span><b>{formatDate(payee.createdAt)}</b>First used</span><span><b>{formatDate(payee.lastUsedAt)}</b>Last used</span>
                    </div>
                    {(payee.aliases?.length ?? 0) > 0 ? <div className="payee-duplicate-aliases"><b>Known names</b>{payee.aliases!.slice(0, 4).map(({ id, value }) => <span key={id}>{value}</span>)}</div> : null}
                    {payee.id !== selectedDuplicateGroup.anchorPayeeId ? <div className="payee-duplicate-candidate-reasons"><b>Why</b>
                      {selectedDuplicateGroup.candidates.find(({ payeeId }) => payeeId === payee.id)?.reasons.map((reason) =>
                        <span key={`${reason.type}:${reason.value}`}>✓ {reason.value}</span>)}</div> : null}
                  </article>
                ))}
              </div>
              <section className="payee-duplicate-reasons"><h3>Why we think these might be the same</h3>
                <div>{selectedDuplicateGroup.reasons.map((reason) => <span key={`${reason.type}:${reason.value}`}>✓ {reason.value}</span>)}</div>
                <small>Automatic suggestions are not always correct. Please review carefully.</small>
              </section>
              <section className="payee-duplicate-actions"><h3>What would you like to do?</h3><div>
                <button type="button" onClick={reviewDuplicateMerge}><strong>Review Merge</strong><span>Use the existing preview and confirmation workflow.</span></button>
                <button type="button" onClick={() => void keepDuplicateMembersSeparate()}><strong>Keep Separate</strong><span>Do not suggest the selected relationships again.</span></button>
                <button type="button" onClick={() => void ignoreDuplicateGroup()}><strong>Ignore Suggestion</strong><span>Hide this entire group and remember the decision.</span></button>
              </div></section>
            </div>
          ) : <div className="payee-duplicate-empty"><strong>No possible duplicates found.</strong><span>We'll show strong suggestions here when they exist.</span></div> : selectedPayee ? (
            <>
              <div className="payee-management-detail-header">
                <button className="payee-detail-icon-button" type="button" onClick={openIconPicker}
                  aria-label={`Change icon for ${selectedPayee.name}`}>
                  <PayeeIcon payee={selectedPayee} size={56} decorative />
                </button>
                <div className="payee-detail-heading-copy">
                  <h2>{selectedPayee.name}</h2>
                  <p className="muted">
                    Edit this payee's details, aliases, and recognition rules.
                  </p>
                  <button className="payee-change-icon-button" type="button" onClick={openIconPicker}>Change icon</button>
                </div>
                <div className="payee-actions-menu">
                  <button
                    className="button button-secondary"
                    type="button"
                    aria-expanded={isActionsOpen}
                    onClick={() => setIsActionsOpen((open) => !open)}
                  >
                    Actions ▾
                  </button>
                  {isActionsOpen ? (
                    <div className="payee-actions-popover" role="menu">
                      <button type="button" role="menuitem" onClick={() => openActionDialog("rename")}>
                        Rename payee
                      </button>
                      <button type="button" role="menuitem" onClick={openMergeDialog}>
                        Merge with another payee
                      </button>
                      <button type="button" role="menuitem" onClick={() => openActionDialog("alias")}>
                        Add alias
                      </button>
                      <button type="button" role="menuitem" onClick={() => openActionDialog("rule")}>
                        Add recognition rule
                      </button>
                      <button type="button" role="menuitem" onClick={() => {
                        setIsActionsOpen(false);
                        void archiveSelectedPayee();
                      }}>
                        Archive payee
                      </button>
                      {getPayeeDeleteEligibility(selectedPayee).canDelete ? (
                        <button className="is-danger" type="button" role="menuitem" onClick={() => {
                          setIsActionsOpen(false);
                          void deleteSelectedPayee();
                        }}>
                          Delete payee
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="payee-detail-summary" aria-label="Payee usage summary">
                <div><strong>{selectedPayee.useCount}</strong><span>Transactions</span></div>
                <div><strong>{selectedPayee.scheduledUseCount ?? 0}</strong><span>Scheduled</span></div>
                <div><strong>{formatDate(selectedPayee.createdAt)}</strong><span>First used</span></div>
                <div><strong>{formatDate(selectedPayee.lastUsedAt)}</strong><span>Last used</span></div>
              </div>

              <nav className="payee-detail-tabs" aria-label="Payee details">
                {([
                  ["overview", "Overview"], ["aliases", "Aliases"], ["rules", "Recognition Rules"],
                  ["transactions", "Transactions"], ["scheduled", "Scheduled"], ["history", "History"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" className={detailTab === value ? "is-active" : ""}
                    onClick={() => setDetailTab(value)}>{label}</button>
                ))}
              </nav>

              {detailTab === "overview" ? (
                <div className="payee-overview-grid">
                  <section className="payee-overview-card">
                    <div className="payee-overview-card-header"><h3>Default Category</h3></div>
                    <select className="payee-management-field" value={draftDefaultCategoryId}
                      onChange={(event) => setDraftDefaultCategoryId(event.target.value)}>
                      <option value="">No default category</option>
                      {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.groupName}: {category.name}</option>)}
                    </select>
                    <p>Used for future recognised transactions only.</p>
                  </section>
                  <section className="payee-overview-card">
                    <div className="payee-overview-card-header"><h3>Aliases ({draftAliases.length})</h3>
                      <button type="button" onClick={() => setDetailTab("aliases")}>Manage</button></div>
                    {draftAliases.length ? draftAliases.slice(0, 4).map((alias) => <span key={alias.id}>{alias.value}</span>) : <p>No aliases yet.</p>}
                  </section>
                  <section className="payee-overview-card">
                    <div className="payee-overview-card-header"><h3>Recognition Rules ({draftRules.length})</h3>
                      <button type="button" onClick={() => setDetailTab("rules")}>View all rules</button></div>
                    {draftRules.length ? draftRules.slice(0, 3).map((rule) => <span key={rule.id}>{ruleTypeLabels[rule.matchType]} “{rule.text}”</span>) : <p>No recognition rules yet.</p>}
                  </section>
                  <section className="payee-overview-card">
                    <h3>Usage</h3>
                    <span>{selectedPayee.useCount} linked transactions</span>
                    <span>{selectedPayee.scheduledUseCount ?? 0} scheduled transactions</span>
                    <p>Open the Transactions or Scheduled tab to inspect linked usage.</p>
                  </section>
                </div>
              ) : detailTab === "aliases" ? (
                <section className="payee-rules-panel payee-tab-panel">
                  <div className="payee-rules-header"><div><h3>Aliases</h3><p className="muted">Exact imported descriptions for this canonical payee.</p></div>
                    <button className="button button-secondary" type="button" onClick={() => setDraftAliases((aliases) => [...aliases, { id: `alias-${Date.now()}`, value: "" }])}>+ Add alias</button></div>
                  <div className="payee-rule-list">{draftAliases.map((alias) => <div className="payee-rule-row" key={alias.id}>
                    <input value={alias.value} placeholder="Exact imported description" onChange={(event) => setDraftAliases((aliases) => aliases.map((item) => item.id === alias.id ? { ...item, value: event.target.value } : item))} />
                    <button className="button button-ghost" type="button" onClick={() => setDraftAliases((aliases) => aliases.filter(({ id }) => id !== alias.id))}>Remove</button>
                  </div>)}</div>
                </section>
              ) : detailTab === "rules" ? (
                <section className="payee-rules-panel payee-tab-panel">
                  <div className="payee-rules-header"><div><h3>Recognition Rules</h3><p className="muted">Deterministic matching for imported descriptions.</p></div>
                    <button className="button button-secondary" type="button" onClick={() => setDraftRules((rules) => [...rules, createDraftRule(draftName || selectedPayee.name)])}>+ Add rule</button></div>
                  {draftRules.length ? <div className="payee-rule-list">{draftRules.map((rule) => <div className="payee-rule-row" key={rule.id}>
                    <select value={rule.matchType} onChange={(event) => updateRule(rule.id, { matchType: event.target.value as PayeeRuleMatchType })}>{Object.entries(ruleTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <input value={rule.text} onChange={(event) => updateRule(rule.id, { text: event.target.value })} placeholder="Imported payee text" />
                    <button className="button button-ghost" type="button" onClick={() => removeRule(rule.id)}>Remove</button>
                  </div>)}</div> : <p className="payee-rule-empty">No recognition rules yet.</p>}
                </section>
              ) : (
                <section className="payee-tab-placeholder">
                  <h3>{detailTab === "transactions" ? "Linked Transactions" : detailTab === "scheduled" ? "Scheduled Transactions" : "History"}</h3>
                  <strong>{detailTab === "transactions" ? selectedPayee.useCount : detailTab === "scheduled" ? selectedPayee.scheduledUseCount ?? 0 : "Not yet available"}</strong>
                  <p>{detailTab === "history" ? "The persistence layer does not yet expose a canonical payee audit feed, so this screen does not fabricate one." : "The current payee read contract exposes the authoritative count but not bounded row details. Row navigation will be added when that repository query is available."}</p>
                </section>
              )}

              <div className="payee-management-actions">
                <p className="muted">{statusMessage}</p>

                <div>
                  {showArchived ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={restoreSelectedPayee}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={archiveSelectedPayee}
                    >
                      Archive
                    </button>
                  )}

                  {!showArchived && getPayeeDeleteEligibility(selectedPayee).canDelete ? (
                    <button className="button button-danger" type="button" onClick={() => void deleteSelectedPayee()}>
                      Delete unused payee
                    </button>
                  ) : null}

                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={!hasUnsavedChanges}
                    onClick={resetDrafts}
                  >
                    Revert
                  </button>

                  <button
                    className="button button-primary"
                    type="button"
                    disabled={!hasUnsavedChanges}
                    onClick={saveSelectedPayee}
                  >
                    Save
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="payee-management-empty-detail">
              <h2>No payee selected</h2>
              <p className="muted">Select a payee to view details.</p>
            </div>
          )}
        </section>
      </Card>

      {actionDialog !== "closed" && selectedPayee ? (
        <div className="app-dialog-backdrop" role="presentation">
          <section className="app-dialog payee-action-dialog" role="dialog" aria-modal="true" aria-labelledby="payee-action-dialog-title">
            <div className="payee-merge-dialog-header">
              <div>
                <h2 id="payee-action-dialog-title">
                  {actionDialog === "rename" ? "Rename Payee" : actionDialog === "alias" ? "Add Alias" : "Add Recognition Rule"}
                </h2>
                <p>
                  {actionDialog === "rename"
                    ? `Rename “${selectedPayee.name}” and update all linked transactions and schedules.`
                    : actionDialog === "alias"
                      ? `Recognise another exact description as “${selectedPayee.name}”.`
                      : `Match imported descriptions and use “${selectedPayee.name}”.`}
                </p>
              </div>
              <button className="button button-ghost" type="button" onClick={() => setActionDialog("closed")}>×</button>
            </div>
            {actionDialog === "rename" ? (
              <>
                <label><span className="field-label">Current name</span><input className="payee-management-field" value={selectedPayee.name} disabled /></label>
                <label><span className="field-label">New name</span><input className="payee-management-field" value={actionValue} onChange={(event) => setActionValue(event.target.value)} autoFocus /></label>
                <label className="payee-required-option"><input type="radio" checked readOnly /> Yes, update all linked register and scheduled transactions</label>
                <p className="muted">Canonical-only renaming is not offered because historical rows store a denormalised payee-name projection.</p>
              </>
            ) : actionDialog === "alias" ? (
              <label><span className="field-label">Exact imported description</span><input className="payee-management-field" value={actionValue} onChange={(event) => setActionValue(event.target.value)} placeholder="e.g. WOOLWORTHS METRO" autoFocus /></label>
            ) : (
              <>
                <label><span className="field-label">When imported description</span><select className="payee-management-field" value={actionRuleType} onChange={(event) => setActionRuleType(event.target.value as PayeeRuleMatchType)}>{Object.entries(ruleTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span className="field-label">Description text</span><input className="payee-management-field" value={actionValue} onChange={(event) => setActionValue(event.target.value)} placeholder="Imported description" autoFocus /></label>
              </>
            )}
            <div className="app-dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setActionDialog("closed")}>Cancel</button>
              <button className="button button-primary" type="button" onClick={() => void saveActionDialog()}>{actionDialog === "rename" ? "Rename Payee" : actionDialog === "alias" ? "Add Alias" : "Save Rule"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {mergeDialogStep !== "closed" && selectedPayee ? (
        <div className="app-dialog-backdrop" role="presentation">
          <section
            className="app-dialog payee-merge-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payee-merge-dialog-title"
          >
            {mergeDialogStep === "confirm" ? (
              <>
                <div className="payee-merge-dialog-header">
                  <div><h2 id="payee-merge-dialog-title">Merge payees?</h2><p>Choose the payee to keep. All other selected payees will be retired.</p></div>
                  <button className="button button-ghost" type="button" disabled={isMergeSubmitting}
                    onClick={() => setMergeDialogStep("closed")} aria-label="Close">×</button>
                </div>
                <div className="payee-merge-choice-list">
                  {orderedSelectedMergePayees.map((payee) => (
                    <label className={`payee-merge-choice ${mergeTargetPayeeId === payee.id ? "is-destination" : ""}`} key={payee.id}>
                      <input type="radio" name="merge-target" checked={mergeTargetPayeeId === payee.id}
                        disabled={isMergeSubmitting} onChange={() => chooseMergeTarget(payee.id)} />
                      <span><strong>{payee.name}</strong><small>{mergeTargetPayeeId === payee.id ? "Payee to keep" : "Will be merged"}</small></span>
                      <small>{payee.useCount} transactions · {payee.scheduledUseCount ?? 0} scheduled</small>
                    </label>
                  ))}
                </div>
                <div className="payee-merge-preview-grid">
                  <div><span>Register transactions updated</span><strong>{selectedMergeTransactionCount}</strong></div>
                  <div><span>Scheduled transactions updated</span><strong>{mergeScheduledCount}</strong></div>
                  <div><span>Exact names learned as aliases</span><strong>{selectedMergePayeeIds.length}</strong></div>
                  <div><span>Recognition rules redirected</span><strong>{selectedMergeRuleCount}</strong></div>
                </div>
                <p className="payee-merge-warning">This atomic change cannot be undone. Original imported descriptions remain unchanged.</p>
                {mergeError ? <p className="payee-merge-error" role="alert">{mergeError}</p> : null}
                <div className="app-dialog-actions">
                  <button className="button button-secondary" type="button" disabled={isMergeSubmitting}
                    onClick={() => setMergeDialogStep("closed")}>Cancel</button>
                  <button className="button button-primary" type="button" disabled={isMergeSubmitting || !mergeTargetPayee || selectedMergePayeeIds.length === 0}
                    onClick={() => void confirmSelectedMerge()}>{isMergeSubmitting ? "Merging…" : "Merge payees"}</button>
                </div>
              </>
            ) : mergeDialogStep === "select" ? (
              <>
                <div className="payee-merge-dialog-header">
                  <div>
                    <h2 id="payee-merge-dialog-title">Merge Payees</h2>
                    <p>Select the payees to combine, then choose which payee to keep.</p>
                  </div>
                  <button className="button button-ghost" type="button" onClick={() => setMergeDialogStep("closed")}>×</button>
                </div>
                <input
                  className="payee-management-search"
                  value={mergeSearch}
                  onChange={(event) => setMergeSearch(event.target.value)}
                  placeholder="Search payees…"
                  autoFocus
                />
                <div className="payee-merge-choice-list">
                  <label className={`payee-merge-choice ${mergeTargetPayeeId === selectedPayee.id ? "is-destination" : ""}`}>
                    <input type="radio" name="merge-target" checked={mergeTargetPayeeId === selectedPayee.id} onChange={() => chooseMergeTarget(selectedPayee.id)} />
                    <span><strong>{selectedPayee.name}</strong><small>Payee to keep</small></span>
                    <small>{selectedPayee.useCount} transactions · {selectedPayee.scheduledUseCount ?? 0} scheduled</small>
                  </label>
                  {mergeCandidates.map((payee) => (
                    <label className={`payee-merge-choice ${mergeTargetPayeeId === payee.id ? "is-destination" : ""}`} key={payee.id}>
                      <span className="payee-merge-choice-controls">
                        <input type="radio" name="merge-target" checked={mergeTargetPayeeId === payee.id} onChange={() => chooseMergeTarget(payee.id)} aria-label={`Keep ${payee.name}`} />
                        <input type="checkbox" checked={selectedMergePayeeIds.includes(payee.id)} disabled={mergeTargetPayeeId === payee.id} onChange={(event) => toggleMergeSelection(payee.id, event.currentTarget.checked)} aria-label={`Merge ${payee.name}`} />
                      </span>
                      <span><strong>{payee.name}</strong><small>{mergeTargetPayeeId === payee.id ? "Payee to keep" : payee.defaultCategoryName ?? "No default category"}</small></span>
                      <small>{payee.useCount} transactions · {payee.scheduledUseCount ?? 0} scheduled</small>
                    </label>
                  ))}
                </div>
                <div className="app-dialog-actions">
                  <button className="button button-secondary" type="button" onClick={() => setMergeDialogStep("closed")}>Cancel</button>
                  <button className="button button-primary" type="button" disabled={selectedMergePayeeIds.length === 0} onClick={() => setMergeDialogStep("options")}>Next</button>
                </div>
              </>
            ) : mergeDialogStep === "options" ? (
              <>
                <div className="payee-merge-dialog-header">
                  <div><h2 id="payee-merge-dialog-title">Merge Options</h2><p>What should happen to records linked to the source payees?</p></div>
                  <button className="button button-ghost" type="button" onClick={() => setMergeDialogStep("closed")}>×</button>
                </div>
                <fieldset className="payee-merge-options">
                  <label><input type="checkbox" checked={updateLinkedTransactions} onChange={(event) => setUpdateLinkedTransactions(event.currentTarget.checked)} /> Update linked register transactions <small>{selectedMergeTransactionCount} transactions</small></label>
                  <label><input type="checkbox" checked={updateScheduledTransactions} onChange={(event) => setUpdateScheduledTransactions(event.currentTarget.checked)} /> Update scheduled transactions <small>{mergeScheduledCount} scheduled</small></label>
                  <label><input type="checkbox" checked={addMergedAliases} onChange={(event) => setAddMergedAliases(event.currentTarget.checked)} /> Add merged names as aliases <small>{selectedMergePayeeIds.length} aliases</small></label>
                  <label><input type="checkbox" checked={redirectRecognitionRules} onChange={(event) => setRedirectRecognitionRules(event.currentTarget.checked)} /> Redirect recognition rules <small>{selectedMergeRuleCount} rules</small></label>
                </fieldset>
                <div className="app-dialog-actions">
                  <button className="button button-secondary" type="button" onClick={() => setMergeDialogStep("select")}>Back</button>
                  <button className="button button-primary" type="button" onClick={() => setMergeDialogStep("preview")}>Preview</button>
                </div>
              </>
            ) : mergeDialogStep === "preview" ? (
              <>
                <div className="payee-merge-dialog-header">
                  <div>
                    <h2 id="payee-merge-dialog-title">Merge Preview</h2>
                    <p>You are about to merge {selectedMergePayeeIds.length} payee{selectedMergePayeeIds.length === 1 ? "" : "s"} into <strong>{mergeTargetPayee?.name}</strong>.</p>
                  </div>
                  <button className="button button-ghost" type="button" onClick={() => setMergeDialogStep("closed")}>×</button>
                </div>
                <div className="payee-merge-preview-grid">
                  <div><span>Register transactions</span><strong>{selectedMergeTransactionCount}</strong></div>
                  <div><span>Scheduled transactions</span><strong>{mergeScheduledCount}</strong></div>
                  <div><span>Aliases to add</span><strong>{addMergedAliases ? selectedMergePayeeIds.length : 0}</strong></div>
                  <div><span>Rules to redirect</span><strong>{redirectRecognitionRules ? selectedMergeRuleCount : 0}</strong></div>
                </div>
                <p className="payee-merge-warning">This action cannot be undone. A backup should be created before merging.</p>
                <div className="app-dialog-actions">
                  <button className="button button-secondary" type="button" onClick={() => setMergeDialogStep("select")}>Back</button>
                  <button className="button button-primary" type="button" onClick={() => void executeMergePreview()}>Merge Payees</button>
                </div>
              </>
            ) : (
              <div className="payee-merge-complete">
                <div className="payee-merge-complete-icon" aria-hidden="true">✓</div>
                <h2 id="payee-merge-dialog-title">Merge completed successfully</h2>
                <p>The selected payees have been merged into <strong>{mergeTargetPayee?.name}</strong>.</p>
                {mergeRecognitionProposal ? (
                  <div className="payee-merge-recognition-proposal">
                    <h3>Prevent this happening again?</h3>
                    {mergeRecognitionProposal.state === "available" ? (
                      <label><input type="checkbox" checked={createRecognitionRuleAfterMerge}
                        onChange={(event) => setCreateRecognitionRuleAfterMerge(event.currentTarget.checked)} />
                        <span><strong>Recognise similar imports as “{mergeRecognitionProposal.targetName}” in future</strong>
                          <small>Imported payee contains “{mergeRecognitionProposal.text}” → {mergeRecognitionProposal.targetName}</small></span></label>
                    ) : mergeRecognitionProposal.state === "existing" ? (
                      <p>Recognition is already configured for “{mergeRecognitionProposal.text}”. No duplicate rule will be created.</p>
                    ) : (
                      <p>A conflicting recognition rule already uses “{mergeRecognitionProposal.text}”. Review it in Recognition Rules; it was not overwritten.</p>
                    )}
                  </div>
                ) : null}
                <button className="button button-primary" type="button" onClick={() => void finishMergeWorkflow()}>Done</button>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {isIconPickerOpen && selectedPayee ? (
        <div className="app-dialog-backdrop" role="presentation">
          <section className="app-dialog payee-icon-picker" role="dialog" aria-modal="true"
            aria-labelledby="payee-icon-picker-title">
            <div className="payee-merge-dialog-header">
              <div><h2 id="payee-icon-picker-title">Change icon</h2><p>Choose an icon for {selectedPayee.name}.</p></div>
              <button className="button button-ghost" type="button" onClick={() => setIsIconPickerOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="payee-icon-picker-grid" role="radiogroup" aria-label="Payee icon">
              <button type="button" role="radio" aria-checked={iconPickerDraft === ""}
                className={iconPickerDraft === "" ? "is-selected" : ""} onClick={() => setIconPickerDraft("")}>
                <PayeeIcon payee={{ ...selectedPayee, iconRef: "" }} size={40} decorative /><span>Automatic</span>
              </button>
              {PAYEE_BUILTIN_ICONS.map(({ key, label }) => {
                const iconRef = serialisePayeeIconReference({ kind: "builtin", key });
                return <button key={key} type="button" role="radio" aria-checked={iconPickerDraft === iconRef}
                  className={iconPickerDraft === iconRef ? "is-selected" : ""} onClick={() => setIconPickerDraft(iconRef)}>
                  <PayeeIcon payee={{ ...selectedPayee, iconRef }} size={40} decorative /><span>{label}</span>
                </button>;
              })}
            </div>
            <div className="app-dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setIsIconPickerOpen(false)}>Cancel</button>
              <button className="button button-primary" type="button" onClick={() => void saveIconSelection()}>Save icon</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function normaliseRulesForComparison(rules: PayeeImportRuleView[]) {
  return rules
    .map((rule) => ({
      matchType: rule.matchType,
      text: rule.text.trim(),
    }))
    .filter((rule) => rule.text.length > 0);
}
