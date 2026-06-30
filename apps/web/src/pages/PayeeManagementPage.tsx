import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "../components/ui/Card";
import { getAppPersistenceGateway } from "../features/persistence";
import type {
  PayeeImportRuleView,
  PayeeRuleMatchType,
  PayeeView,
} from "../features/accounts/payeeService";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";
import { confirmDialog } from "../features/ui/appDialogService";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../features/budget/budgetMonthNavigation";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

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
}: {
  payee: PayeeView;
  isSelected: boolean;
  isChecked: boolean;
  isDropTarget: boolean;
  isDragSource: boolean;
  disabled: boolean;
  onSelect: (payee: PayeeView, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const draggable = useDraggable({
    id: getPayeeDragId(payee.id),
    disabled,
    data: {
      type: "payee-merge-source",
      payeeId: payee.id,
    },
  });
  const droppable = useDroppable({
    id: getPayeeDropId(payee.id),
    disabled,
    data: {
      type: "payee-merge-target",
      payeeId: payee.id,
    },
  });
  const transform = draggable.transform
    ? CSS.Transform.toString(draggable.transform)
    : undefined;

  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      className={[
        "payee-management-list-item-shell",
        isSelected ? "payee-management-list-item-shell-selected" : "",
        isChecked ? "payee-management-list-item-shell-checked" : "",
        isDropTarget ? "payee-management-list-item-shell-drop-target" : "",
        isDragSource || draggable.isDragging
          ? "payee-management-list-item-shell-dragging"
          : "",
        droppable.isOver && !isDropTarget
          ? "payee-management-list-item-shell-drop-hover"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform }}
      title={!disabled ? "Drag onto another payee to merge" : undefined}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <button
        className="payee-management-list-item"
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={(event) => onSelect(payee, event)}
      >
        <strong>{payee.name}</strong>
        <span>{payee.useCount} transactions</span>
        {isDropTarget ? (
          <small className="payee-merge-badge">
            Release to merge into this payee
          </small>
        ) : isChecked ? (
          <small className="payee-merge-badge">Selected · drag to merge</small>
        ) : payee.defaultCategoryName ? (
          <small title={payee.defaultCategoryName}>
            {payee.defaultCategoryName}
          </small>
        ) : payee.note?.trim() ? (
          <small title={payee.note}>Has note</small>
        ) : null}
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
  const persistenceGateway = getAppPersistenceGateway();
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
  const [search, setSearch] = useState("");
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftDefaultCategoryId, setDraftDefaultCategoryId] = useState("");
  const [draftRules, setDraftRules] = useState<PayeeImportRuleView[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Select a payee to edit it.",
  );
  const [selectedMergePayeeIds, setSelectedMergePayeeIds] = useState<string[]>(
    [],
  );
  const [lastSelectedMergePayeeId, setLastSelectedMergePayeeId] = useState<
    string | null
  >(null);
  const [draggedMergePayeeId, setDraggedMergePayeeId] = useState<string | null>(
    null,
  );
  const [mergeDropTargetPayeeId, setMergeDropTargetPayeeId] = useState<
    string | null
  >(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  useEffect(() => {
    let active = true;

    Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
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
    ]).then(([loadedPayees, loadedArchivedPayees, loadedCategoryOptions]) => {
      if (!active) {
        return;
      }

      setPayees(loadedPayees);
      setArchivedPayees(loadedArchivedPayees);
      setCategoryOptions(loadedCategoryOptions);
      setSelectedPayeeId(
        (currentPayeeId) => currentPayeeId ?? loadedPayees[0]?.id ?? null,
      );
    });

    return () => {
      active = false;
    };
  }, [budgetViewPersistence, budgets, payeesPersistence, selectedBudgetId]);

  const visiblePayees = showArchived ? archivedPayees : payees;

  const filteredPayees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) {
      return visiblePayees;
    }

    return visiblePayees.filter((payee) =>
      payee.name.toLocaleLowerCase().includes(query),
    );
  }, [visiblePayees, search]);

  const selectedPayee =
    visiblePayees.find((payee) => payee.id === selectedPayeeId) ??
    filteredPayees[0] ??
    null;

  useEffect(() => {
    setDraftName(selectedPayee?.name ?? "");
    setDraftNote(selectedPayee?.note ?? "");
    setDraftDefaultCategoryId(selectedPayee?.defaultCategoryId ?? "");
    setDraftRules(selectedPayee?.importRules ?? []);
    setMergeDropTargetPayeeId(null);
  }, [
    selectedPayee?.id,
    selectedPayee?.name,
    selectedPayee?.note,
    selectedPayee?.defaultCategoryId,
    selectedPayee?.importRules,
  ]);

  const selectedCategory = categoryOptions.find(
    (category) => category.id === draftDefaultCategoryId,
  );

  const selectedMergePayees = payees.filter((payee) =>
    selectedMergePayeeIds.includes(payee.id),
  );
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

  const hasUnsavedChanges =
    Boolean(selectedPayee) &&
    (draftName.trim() !== selectedPayee?.name ||
      draftNote.trim() !== (selectedPayee?.note ?? "") ||
      draftDefaultCategoryId !== (selectedPayee?.defaultCategoryId ?? "") ||
      JSON.stringify(normaliseRulesForComparison(draftRules)) !==
        JSON.stringify(
          normaliseRulesForComparison(selectedPayee?.importRules ?? []),
        ));

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

    const nextPayees = await payeesPersistence.updatePayee({
      id: selectedPayee.id,
      name: nextName,
      note: draftNote,
      defaultCategoryId: selectedCategory?.id ?? "",
      defaultCategoryName: selectedCategory
        ? `${selectedCategory.groupName}: ${selectedCategory.name}`
        : "",
      importRules: nextRules,
    });

    setPayees(nextPayees);
    setStatusMessage(`Saved ${nextName}.`);

    const updatedPayee = nextPayees.find((payee) => payee.name === nextName);
    setSelectedPayeeId(updatedPayee?.id ?? selectedPayee.id);
  }

  async function archiveSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const shouldArchive = confirmDialog({
      title: `Archive "${selectedPayee.name}"?`,
      message:
        "Archived payees are hidden from the active payee list but can be restored later.",
    });

    if (!shouldArchive) {
      return;
    }

    const nextPayees = await payeesPersistence.archivePayee(selectedPayee.id);
    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setSelectedPayeeId(nextPayees[0]?.id ?? null);
    setStatusMessage(`Archived ${selectedPayee.name}.`);
  }

  async function restoreSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const nextPayees = await payeesPersistence.restorePayee(selectedPayee.id);
    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setShowArchived(false);
    setSelectedPayeeId(selectedPayee.id);
    setStatusMessage(`Restored ${selectedPayee.name}.`);
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
    setLastSelectedMergePayeeId(null);
    setDraggedMergePayeeId(null);
    setMergeDropTargetPayeeId(null);
    setStatusMessage("Merge selection cleared.");
  }

  function getDragSourcePayees(payeeId: string): PayeeView[] {
    if (selectedMergePayeeIds.includes(payeeId)) {
      return payees.filter((payee) => selectedMergePayeeIds.includes(payee.id));
    }

    return payees.filter((payee) => payee.id === payeeId);
  }

  function startPayeeDrag(payeeId: string) {
    const dragSourcePayees = getDragSourcePayees(payeeId);
    const sourcePayee = dragSourcePayees[0];

    setDraggedMergePayeeId(payeeId);
    setStatusMessage(
      dragSourcePayees.length === 1
        ? `Drag ${sourcePayee?.name ?? "this payee"} onto the payee you want to keep.`
        : `Drag ${dragSourcePayees.length} payees onto the payee you want to keep.`,
    );
  }

  function endPayeeDrag() {
    setDraggedMergePayeeId(null);
    setMergeDropTargetPayeeId(null);
  }

  function handlePayeeDragStart(event: DragStartEvent) {
    const payeeId = String(
      event.active.data.current?.payeeId ??
        getPayeeIdFromDndId(String(event.active.id)),
    );
    startPayeeDrag(payeeId);
  }

  function handlePayeeDragOver(event: DragOverEvent) {
    const activePayeeId = String(
      event.active.data.current?.payeeId ??
        getPayeeIdFromDndId(String(event.active.id)),
    );
    const sourcePayees = getDragSourcePayees(activePayeeId);
    const sourceIds = new Set(
      sourcePayees.map((sourcePayee) => sourcePayee.id),
    );
    const targetPayeeId = event.over
      ? String(
          event.over.data.current?.payeeId ??
            getPayeeIdFromDndId(String(event.over.id)),
        )
      : null;

    if (!targetPayeeId || sourceIds.has(targetPayeeId)) {
      setMergeDropTargetPayeeId(null);
      return;
    }

    setMergeDropTargetPayeeId(targetPayeeId);
  }

  function handlePayeeDragEnd(event: DragEndEvent) {
    const activePayeeId = String(
      event.active.data.current?.payeeId ??
        getPayeeIdFromDndId(String(event.active.id)),
    );
    const sourcePayees = getDragSourcePayees(activePayeeId);
    const sourceIds = new Set(
      sourcePayees.map((sourcePayee) => sourcePayee.id),
    );
    const targetPayeeId = event.over
      ? String(
          event.over.data.current?.payeeId ??
            getPayeeIdFromDndId(String(event.over.id)),
        )
      : null;
    const targetPayee = targetPayeeId
      ? payees.find((payee) => payee.id === targetPayeeId)
      : null;

    if (!targetPayee || sourceIds.has(targetPayee.id)) {
      endPayeeDrag();
      return;
    }

    void mergePayeesIntoTarget(targetPayee, activePayeeId);
  }

  async function mergePayeesIntoTarget(
    targetPayee: PayeeView,
    sourcePayeeId: string,
  ) {
    const sourcePayees = getDragSourcePayees(sourcePayeeId).filter(
      (sourcePayee) => sourcePayee.id !== targetPayee.id,
    );

    if (sourcePayees.length === 0) {
      endPayeeDrag();
      return;
    }

    const transactionCount = sourcePayees.reduce(
      (total, payee) => total + payee.useCount,
      0,
    );
    const ruleCount = sourcePayees.reduce(
      (total, payee) => total + (payee.importRules?.length ?? 0),
      0,
    );
    const noteCount = sourcePayees.filter((payee) => payee.note?.trim()).length;
    const shouldMerge = confirmDialog({
      title:
        sourcePayees.length === 1
          ? `Merge "${sourcePayees[0].name}" into "${targetPayee.name}"?`
          : `Merge ${sourcePayees.length} payees into "${targetPayee.name}"?`,
      message:
        `${transactionCount} transactions, ${ruleCount} import rules, and ${noteCount} notes ` +
        `will be folded into "${targetPayee.name}". Source payees will be archived.`,
    });

    if (!shouldMerge) {
      endPayeeDrag();
      return;
    }

    let nextPayees = payees;

    for (const sourcePayee of sourcePayees) {
      nextPayees = await payeesPersistence.mergePayees({
        sourcePayeeId: sourcePayee.id,
        targetPayeeId: targetPayee.id,
      });
    }

    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
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
  }

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
          <div className="payee-management-list-toolbar">
            <label className="field-label" htmlFor="payee-management-search">
              Search payees
            </label>

            <div className="payee-management-list-toolbar-actions">
              {selectedMergePayeeIds.length > 0 ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={clearMergeSelection}
                >
                  Clear selection
                </button>
              ) : null}

              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setShowArchived((value) => !value);
                  setSelectedPayeeId(null);
                  setSelectedMergePayeeIds([]);
                  setLastSelectedMergePayeeId(null);
                  setDraggedMergePayeeId(null);
                  setMergeDropTargetPayeeId(null);
                }}
              >
                {showArchived ? "Show active" : "Show archived"}
              </button>
            </div>
          </div>

          <input
            id="payee-management-search"
            className="payee-management-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search payees..."
          />

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handlePayeeDragStart}
            onDragOver={handlePayeeDragOver}
            onDragEnd={handlePayeeDragEnd}
            onDragCancel={endPayeeDrag}
          >
            <div className="payee-management-list" role="listbox">
              {filteredPayees.length > 0 ? (
                filteredPayees.map((payee) => (
                  <PayeeMergeListItem
                    key={payee.id}
                    payee={payee}
                    isSelected={selectedPayee?.id === payee.id}
                    isChecked={selectedMergePayeeIds.includes(payee.id)}
                    isDropTarget={mergeDropTargetPayeeId === payee.id}
                    isDragSource={Boolean(
                      draggedMergePayeeId &&
                      getDragSourcePayees(draggedMergePayeeId).some(
                        (sourcePayee) => sourcePayee.id === payee.id,
                      ),
                    )}
                    disabled={showArchived}
                    onSelect={selectPayeeForMerge}
                  />
                ))
              ) : (
                <p className="payee-management-empty">No payees found.</p>
              )}
            </div>

            <DragOverlay
              dropAnimation={{
                duration: 170,
                easing: "cubic-bezier(0.2, 0, 0, 1)",
              }}
            >
              <PayeeMergeDragOverlay
                sourcePayees={
                  draggedMergePayeeId
                    ? getDragSourcePayees(draggedMergePayeeId)
                    : []
                }
              />
            </DragOverlay>
          </DndContext>

          {!showArchived ? (
            <div className="payee-drag-merge-help">
              <strong>Merge payees by dragging</strong>
              <span>
                Select with Ctrl/Cmd-click or Shift-click, then drag a selected
                payee onto the payee to keep.
                {selectedMergePayeeIds.length > 0
                  ? ` ${selectedMergePayeeIds.length} selected · ${selectedMergeTransactionCount} transactions.`
                  : ""}
              </span>
            </div>
          ) : null}
        </aside>

        <section className="payee-management-detail-panel">
          {selectedPayee ? (
            <>
              <div className="payee-management-detail-header">
                <div>
                  <h2>{selectedPayee.name}</h2>
                  <p className="muted">
                    Edit the selected payee. Merge actions will be added in a
                    follow-up release.
                  </p>
                </div>
              </div>

              <div className="payee-management-editor">
                <label>
                  <span className="field-label">Name</span>
                  <input
                    className="payee-management-field"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                </label>

                <label>
                  <span className="field-label">Default Category</span>
                  <select
                    className="payee-management-field"
                    value={draftDefaultCategoryId}
                    onChange={(event) =>
                      setDraftDefaultCategoryId(event.target.value)
                    }
                  >
                    <option value="">No default category</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.groupName}: {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="field-label">Notes</span>
                  <textarea
                    className="payee-management-textarea"
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows={4}
                    placeholder="Add internal notes about this payee..."
                  />
                </label>
              </div>

              <section className="payee-rules-panel">
                <div className="payee-rules-header">
                  <div>
                    <h3>Import Rules</h3>
                    <p className="muted">
                      Match imported payee text and rename it to this payee.
                    </p>
                  </div>

                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      setDraftRules((rules) => [
                        ...rules,
                        createDraftRule(draftName || selectedPayee.name),
                      ])
                    }
                  >
                    + Add rule
                  </button>
                </div>

                {draftRules.length > 0 ? (
                  <div className="payee-rule-list">
                    {draftRules.map((rule) => (
                      <div className="payee-rule-row" key={rule.id}>
                        <select
                          value={rule.matchType}
                          onChange={(event) =>
                            updateRule(rule.id, {
                              matchType: event.target
                                .value as PayeeRuleMatchType,
                            })
                          }
                        >
                          {Object.entries(ruleTypeLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>

                        <input
                          value={rule.text}
                          onChange={(event) =>
                            updateRule(rule.id, { text: event.target.value })
                          }
                          placeholder="Imported payee text"
                        />

                        <button
                          className="button button-ghost"
                          type="button"
                          onClick={() => removeRule(rule.id)}
                          aria-label="Remove import rule"
                          title="Remove import rule"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="payee-rule-empty">
                    No import rules yet. Add a rule to automatically recognise
                    imported versions of this payee.
                  </p>
                )}
              </section>

              <div className="payee-management-stats">
                <div>
                  <span>Transactions</span>
                  <strong>{selectedPayee.useCount}</strong>
                </div>
                <div>
                  <span>First used</span>
                  <strong>{formatDate(selectedPayee.createdAt)}</strong>
                </div>
                <div>
                  <span>Last used</span>
                  <strong>{formatDate(selectedPayee.lastUsedAt)}</strong>
                </div>
              </div>

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
