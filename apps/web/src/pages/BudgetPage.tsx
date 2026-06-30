import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { confirmDialog } from "../features/ui/appDialogService";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { evaluateAssignedInput } from "../features/budget/evaluateAssignedInput";
import {
  getCurrentBudgetMonth,
  getNextBudgetMonth,
  getPreviousBudgetMonth,
} from "../features/budget/budgetMonthNavigation";
import { useBudgetWorkspace } from "../features/budget/useBudgetWorkspace";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import type {
  BudgetActivityDrilldown,
  BudgetActivityDrilldownRow,
  BudgetCategoryGroupView,
  BudgetCategoryView,
} from "../features/budget/budgetViewTypes";
import { isMoneyNegative, isMoneyZero, normaliseMoney } from "../features/budget/moneyMath";
import { formatDateForDisplay } from "../features/settings/dateFormatting";
import { useDateFormatPreference } from "../features/settings/useDateFormatPreference";
import { ColumnResizeHandle } from "../features/tableLayout/ColumnResizeHandle";
import { useTableLayout, type TableColumnDefinition } from "../features/tableLayout/tableLayout";

type BudgetColumnId = "category" | "assigned" | "activity" | "available";
type BudgetCategoryDropPosition = "before" | "after";
type BudgetGroupDropPosition = "before" | "after";

interface BudgetCategoryDragState {
  categoryId: string;
  groupId: string;
}

interface BudgetCategoryDropTarget {
  categoryId: string;
  position: BudgetCategoryDropPosition;
}

interface BudgetGroupDragState {
  groupId: string;
}

interface BudgetGroupDropTarget {
  groupId: string;
  position: BudgetGroupDropPosition;
}

const BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX = "budget-app.budget-table-layout.v1";

const BUDGET_COLUMN_DEFINITIONS: readonly TableColumnDefinition<BudgetColumnId>[] = [
  { id: "category", label: "Category Group", template: "minmax(15rem, 1fr)", widthRem: 15 },
  { id: "assigned", label: "Assigned", template: "7rem", widthRem: 7 },
  { id: "activity", label: "Activity", template: "7rem", widthRem: 7 },
  { id: "available", label: "Available", template: "7rem", widthRem: 7 },
];

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(normaliseMoney(value));
}

function getAvailableClass(value: number, isOverassignedSource: boolean) {
  if (isMoneyNegative(value)) {
    return "available-pill available-pill-negative";
  }

  if (isMoneyZero(value)) {
    return "available-pill available-pill-zero";
  }

  if (isOverassignedSource) {
    return "available-pill available-pill-warning";
  }

  return "available-pill available-pill-positive";
}

function EditableAssignedCell({
  category,
  currencyCode,
  isOverassignedSource,
  onSave,
}: {
  category: BudgetCategoryView;
  currencyCode: string;
  isOverassignedSource: boolean;
  onSave: (value: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(category.assigned.toFixed(2));
  const [hasError, setHasError] = useState(false);

  function save() {
    const value = evaluateAssignedInput(draft, category.assigned);

    if (value === null) {
      setHasError(true);
      return;
    }

    setHasError(false);
    onSave(value);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        className={
          hasError ? "assigned-input assigned-input-error" : "assigned-input"
        }
        autoFocus
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setHasError(false);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            save();
          }

          if (event.key === "Escape") {
            setDraft(category.assigned.toFixed(2));
            setHasError(false);
            setIsEditing(false);
          }
        }}
        title="Try 150, +50, -25, 100+50, or 200/2"
      />
    );
  }

  return (
    <button
      className={
        isOverassignedSource
          ? "assigned-button assigned-button-warning"
          : "assigned-button"
      }
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setDraft(category.assigned.toFixed(2));
        setHasError(false);
        setIsEditing(true);
      }}
      title="Click to edit. Supports +50, -25, or 100+50."
    >
      {formatMoney(category.assigned, currencyCode)}
    </button>
  );
}

function BudgetCategoryRow({
  category,
  groupId,
  currencyCode,
  isSelected,
  isOverassignedSource,
  isDragSource,
  dropPosition,
  onSelect,
  onOpenCategoryEditor,
  onAssignedChange,
  onActivityClick,
  onDragStart,
  onDragOverCategory,
  onDropCategory,
  onDragEnd,
  isBudgetColumnVisible,
  rowStyle,
}: {
  category: BudgetCategoryView;
  groupId: string;
  currencyCode: string;
  isSelected: boolean;
  isOverassignedSource: boolean;
  isDragSource: boolean;
  dropPosition: BudgetCategoryDropPosition | null;
  onSelect: () => void;
  onOpenCategoryEditor: () => void;
  onAssignedChange: (value: number) => void;
  onActivityClick: () => void;
  onDragStart: (categoryId: string, groupId: string) => void;
  onDragOverCategory: (
    event: DragEvent<HTMLButtonElement>,
    targetCategoryId: string,
    targetGroupId: string,
  ) => void;
  onDropCategory: (targetCategoryId: string, targetGroupId: string) => void;
  onDragEnd: () => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
}) {
  const categoryNotePreview = category.note?.trim().split(/\r?\n/)[0] ?? "";

  return (
    <button
      type="button"
      className={[
        "budget-workspace-row interactive-budget-row",
        isSelected ? "budget-workspace-row-selected" : "",
        isDragSource ? "budget-workspace-row-dragging" : "",
        dropPosition === "before" ? "budget-workspace-row-drop-before" : "",
        dropPosition === "after" ? "budget-workspace-row-drop-after" : "",
      ].filter(Boolean).join(" ")}
      onClick={onSelect}
      onDragOver={(event) => onDragOverCategory(event, category.id, groupId)}
      onDrop={(event) => {
        event.preventDefault();
        onDropCategory(category.id, groupId);
      }}
      onDragEnd={onDragEnd}
      style={rowStyle}
    >
      <div className="budget-category-cell">
        <span
          className="drag-handle drag-handle-active"
          title="Drag to reorder within this category group"
          draggable
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", category.id);
            onDragStart(category.id, groupId);
          }}
          aria-label={`Drag ${category.name} to reorder within ${groupId}`}
        >
          ⋮⋮
        </span>

        <div className="budget-category-label-stack">
          <span className="budget-category-name-line">
            <span
              className="budget-category-name-button"
              role="button"
              tabIndex={0}
              title="Edit category name, note, or archive status"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCategoryEditor();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenCategoryEditor();
                }
              }}
            >
              <strong className="budget-category-name">{category.name}</strong>
            </span>
            {category.isArchived ? (
              <span className="category-archived-badge">Archived</span>
            ) : null}
            {categoryNotePreview ? (
              <span
                className="category-note-indicator"
                title={category.note?.trim()}
                aria-label="Category has a note"
              >
                ✎
              </span>
            ) : null}
          </span>

        </div>
      </div>

      {isBudgetColumnVisible("assigned") ? (
        <EditableAssignedCell
          category={category}
          currencyCode={currencyCode}
          isOverassignedSource={isOverassignedSource}
          onSave={onAssignedChange}
        />
      ) : null}

      {isBudgetColumnVisible("activity") ? (
        <button
          className="activity-drilldown-button"
          type="button"
          disabled={category.activity === 0}
          onClick={(event) => {
            event.stopPropagation();
            onActivityClick();
          }}
          title={
            category.activity === 0
              ? "No activity for this category"
              : "Show activity transactions"
          }
        >
          {formatMoney(category.activity, currencyCode)}
        </button>
      ) : null}

      {isBudgetColumnVisible("available") ? (
        <strong
          className={getAvailableClass(category.available, isOverassignedSource)}
        >
          {formatMoney(category.available, currencyCode)}
        </strong>
      ) : null}
    </button>
  );
}

function BudgetGroup({
  group,
  currencyCode,
  selectedCategoryId,
  overassignedCategoryIds,
  onSelectCategory,
  onOpenCategoryEditor,
  onAssignedChange,
  onActivityClick,
  dragState,
  dropTarget,
  isGroupDragSource,
  groupDropPosition,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDrop,
  onGroupDragEnd,
  onCategoryDragStart,
  onCategoryDragOver,
  onCategoryDrop,
  onCategoryDragEnd,
  isBudgetColumnVisible,
  rowStyle,
}: {
  group: BudgetCategoryGroupView;
  currencyCode: string;
  selectedCategoryId: string | null;
  overassignedCategoryIds: string[];
  onSelectCategory: (categoryId: string) => void;
  onOpenCategoryEditor: (categoryId: string) => void;
  onAssignedChange: (categoryId: string, value: number) => void;
  onActivityClick: (categoryId: string) => void;
  dragState: BudgetCategoryDragState | null;
  dropTarget: BudgetCategoryDropTarget | null;
  isGroupDragSource: boolean;
  groupDropPosition: BudgetGroupDropPosition | null;
  onGroupDragStart: (groupId: string) => void;
  onGroupDragOver: (
    event: DragEvent<HTMLDivElement>,
    targetGroupId: string,
  ) => void;
  onGroupDrop: (targetGroupId: string) => void;
  onGroupDragEnd: () => void;
  onCategoryDragStart: (categoryId: string, groupId: string) => void;
  onCategoryDragOver: (
    event: DragEvent<HTMLButtonElement>,
    targetCategoryId: string,
    targetGroupId: string,
  ) => void;
  onCategoryDrop: (targetCategoryId: string, targetGroupId: string) => void;
  onCategoryDragEnd: () => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
}) {
  const groupHasOverassignedCategory = group.categories.some((category) =>
    overassignedCategoryIds.includes(category.id),
  );

  return (
    <section className="budget-workspace-group">
      <div
        className={[
          "budget-workspace-group-header",
          isGroupDragSource ? "budget-workspace-group-header-dragging" : "",
          groupDropPosition === "before" ? "budget-workspace-group-drop-before" : "",
          groupDropPosition === "after" ? "budget-workspace-group-drop-after" : "",
        ].filter(Boolean).join(" ")}
        style={rowStyle}
        onDragOver={(event) => onGroupDragOver(event, group.id)}
        onDrop={(event) => {
          event.preventDefault();
          onGroupDrop(group.id);
        }}
        onDragEnd={onGroupDragEnd}
      >
        <div className="budget-group-title">
          <span
            className="drag-handle drag-handle-active budget-group-drag-handle"
            title="Drag to reorder category groups"
            draggable
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", group.id);
              onGroupDragStart(group.id);
            }}
            aria-label={`Drag ${group.name} category group to reorder groups`}
          >
            ⋮⋮
          </span>
          <span>⌄</span>
          <strong>{group.name}</strong>
          {group.note?.trim() ? (
            <span
              className="category-note-indicator"
              title={group.note.trim()}
              aria-label="Category group has a note"
            >
              ✎
            </span>
          ) : null}
        </div>

        {isBudgetColumnVisible("assigned") ? (
          <strong>{formatMoney(group.assigned, currencyCode)}</strong>
        ) : null}
        {isBudgetColumnVisible("activity") ? (
          <strong>{formatMoney(group.activity, currencyCode)}</strong>
        ) : null}
        {isBudgetColumnVisible("available") ? (
          <strong
            className={getAvailableClass(
              group.available,
              groupHasOverassignedCategory,
            )}
          >
            {formatMoney(group.available, currencyCode)}
          </strong>
        ) : null}
      </div>

      {group.categories.map((category) => {
        const isOverassignedSource = overassignedCategoryIds.includes(
          category.id,
        );

        return (
          <BudgetCategoryRow
            key={category.id}
            category={category}
            groupId={group.id}
            currencyCode={currencyCode}
            isSelected={selectedCategoryId === category.id}
            isOverassignedSource={isOverassignedSource}
            isDragSource={dragState?.categoryId === category.id}
            dropPosition={
              dropTarget?.categoryId === category.id ? dropTarget.position : null
            }
            onSelect={() => onSelectCategory(category.id)}
            onOpenCategoryEditor={() => onOpenCategoryEditor(category.id)}
            onAssignedChange={(value) => onAssignedChange(category.id, value)}
            onActivityClick={() => onActivityClick(category.id)}
            onDragStart={onCategoryDragStart}
            onDragOverCategory={onCategoryDragOver}
            onDropCategory={onCategoryDrop}
            onDragEnd={onCategoryDragEnd}
            isBudgetColumnVisible={isBudgetColumnVisible}
            rowStyle={rowStyle}
          />
        );
      })}
    </section>
  );
}

function CategoryInspector({
  category,
  group,
  currencyCode,
  isOverassignedSource,
  onSetCategoryArchived,
  onOpenManageCategory,
}: {
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  currencyCode: string;
  isOverassignedSource: boolean;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  onOpenManageCategory: () => void;
}) {
  if (!category || !group) {
    return (
      <Card className="budget-inspector-card">
        <div className="panel-section-header">
          <h2>Category Details</h2>
          <p className="muted">Select a category to inspect it.</p>
        </div>

        <div className="inspector-empty">
          Click a budget category to see details here.
        </div>
      </Card>
    );
  }

  const statusLabel = isMoneyNegative(category.available)
    ? "Overspent"
    : isOverassignedSource
      ? "Overbudgeted"
      : "Available";
  const hasCategoryNote = Boolean(category.note?.trim());
  const hasGroupNote = Boolean(group.note?.trim());

  return (
    <Card className="budget-inspector-card">
      <div className="panel-section-header category-inspector-header">
        <div>
          <h2>{category.name}</h2>
          <p className="muted">
            {group.name}
            {category.isArchived ? " · Archived" : ""}
          </p>
        </div>
      </div>

      <div className="inspector-breakdown">
        <div>
          <span>Assigned</span>
          <strong>{formatMoney(category.assigned, currencyCode)}</strong>
        </div>
        <div>
          <span>Activity</span>
          <strong>{formatMoney(category.activity, currencyCode)}</strong>
        </div>
        <div>
          <span>Available</span>
          <strong
            className={getAvailableClass(
              category.available,
              isOverassignedSource,
            )}
          >
            {formatMoney(category.available, currencyCode)}
          </strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>

      {hasCategoryNote || hasGroupNote ? (
        <div className="inspector-note category-details-note-summary">
          <h3>Notes</h3>
          <p className="muted">
            {hasCategoryNote && hasGroupNote
              ? "This category and its group have notes."
              : hasCategoryNote
                ? "This category has notes."
                : "This category group has notes."}
          </p>
        </div>
      ) : null}

      <div className="category-details-actions">
        <button
          className="button button-secondary category-archive-button"
          type="button"
          onClick={() =>
            onSetCategoryArchived(category.id, !category.isArchived)
          }
        >
          {category.isArchived ? "Restore category" : "Archive category"}
        </button>

        <button
          className="button button-primary"
          type="button"
          onClick={onOpenManageCategory}
        >
          Manage Category…
        </button>
      </div>
    </Card>
  );
}

function CategoryManagementDialog({
  category,
  group,
  isOpen,
  onClose,
  onRenameCategory,
  onSetCategoryArchived,
  onUpdateCategoryNote,
}: {
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  isOpen: boolean;
  onClose: () => void;
  onRenameCategory: (categoryId: string, name: string) => void;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  onUpdateCategoryNote: (categoryId: string, note: string) => void;
}) {
  const [draftName, setDraftName] = useState(category?.name ?? "");
  const [draftCategoryNote, setDraftCategoryNote] = useState(category?.note ?? "");

  useEffect(() => {
    setDraftName(category?.name ?? "");
    setDraftCategoryNote(category?.note ?? "");
  }, [category?.id, category?.name, category?.note]);

  function cancelRename() {
    setDraftName(category?.name ?? "");
  }

  function saveRename() {
    if (!category) {
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setDraftName(category.name);
      return;
    }

    if (trimmedName !== category.name) {
      onRenameCategory(category.id, trimmedName);
    }
  }

  function saveCategoryNote() {
    if (!category) {
      return;
    }

    if (draftCategoryNote !== (category.note ?? "")) {
      onUpdateCategoryNote(category.id, draftCategoryNote);
    }
  }

  if (!isOpen || !category || !group) {
    return null;
  }

  return (
    <div
      className="category-management-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="category-management-modal category-management-modal-compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-management-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="category-management-modal-header">
          <div>
            <h2 id="category-management-title">Edit Category</h2>
            <p className="muted">
              {category.name} · {group.name}
            </p>
          </div>

          <button
            className="budget-activity-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close category editor"
          >
            ×
          </button>
        </header>

        <div className="category-management-sections category-management-sections-compact">
          <section className="category-management-section">
            <h3>Category details</h3>
            <label className="category-management-field">
              <span>Category name</span>
              <input
                className="category-rename-input"
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    saveRename();
                  }

                  if (event.key === "Escape") {
                    cancelRename();
                  }
                }}
                aria-label="Category name"
              />
            </label>

            <label className="category-management-field">
              <span>Category note</span>
              <textarea
                className="category-note-textarea"
                value={draftCategoryNote}
                onChange={(event) => setDraftCategoryNote(event.target.value)}
                onBlur={saveCategoryNote}
                placeholder="Add reminders, rules, renewal dates, or category-specific instructions…"
                rows={5}
              />
            </label>
          </section>

          <section className="category-management-section category-management-actions-section">
            <h3>Actions</h3>
            <button
              className="button button-secondary category-archive-button"
              type="button"
              onClick={() =>
                onSetCategoryArchived(category.id, !category.isArchived)
              }
            >
              {category.isArchived ? "Restore category" : "Archive category"}
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}



function BudgetActivityDrilldownModal({
  drilldown,
  isLoading,
  onClose,
  onTransactionClick,
}: {
  drilldown: BudgetActivityDrilldown | null;
  isLoading: boolean;
  onClose: () => void;
  onTransactionClick: (row: BudgetActivityDrilldownRow) => void;
}) {
  const dateFormat = useDateFormatPreference();

  if (!drilldown && !isLoading) {
    return null;
  }

  return (
    <div className="budget-activity-modal-backdrop" role="presentation">
      <section
        className="budget-activity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-activity-modal-title"
      >
        <header className="budget-activity-modal-header">
          <div>
            <h2 id="budget-activity-modal-title">
              {drilldown ? `${drilldown.categoryName} Activity` : "Category Activity"}
            </h2>
            <p className="muted">
              {drilldown
                ? `${drilldown.monthLabel} · ${drilldown.rows.length} transaction${drilldown.rows.length === 1 ? "" : "s"}`
                : "Loading activity…"}
            </p>
          </div>

          <button
            className="budget-activity-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close activity drilldown"
          >
            ×
          </button>
        </header>

        {isLoading ? (
          <div className="budget-activity-empty">Loading category activity…</div>
        ) : drilldown && drilldown.rows.length > 0 ? (
          <>
            <div className="budget-activity-table" role="table">
              <div className="budget-activity-table-head" role="row">
                <span>Date</span>
                <span>Payee</span>
                <span>Memo</span>
                <span>Outflow</span>
                <span>Inflow</span>
                <span>Account</span>
              </div>

              {drilldown.rows.map((row) => (
                <button
                  key={row.id}
                  className="budget-activity-table-row"
                  type="button"
                  onClick={() => onTransactionClick(row)}
                  title="Open this transaction in the account register"
                >
                  <span>{formatDateForDisplay(row.date, dateFormat, "short")}</span>
                  <strong>{row.payee}</strong>
                  <span className="budget-activity-memo">
                    {row.memo || (row.isSplit ? "Split line" : "—")}
                  </span>
                  <span className={row.outflow > 0 ? "money-negative" : ""}>
                    {row.outflow > 0
                      ? formatMoney(row.outflow, drilldown.currencyCode)
                      : "—"}
                  </span>
                  <span className={row.inflow > 0 ? "money-positive" : ""}>
                    {row.inflow > 0
                      ? formatMoney(row.inflow, drilldown.currencyCode)
                      : "—"}
                  </span>
                  <span>{row.accountName}</span>
                </button>
              ))}
            </div>

            <footer className="budget-activity-modal-footer">
              <div>
                <span>Total outflow</span>
                <strong className="money-negative">
                  {formatMoney(drilldown.totalOutflow, drilldown.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Total inflow</span>
                <strong className="money-positive">
                  {formatMoney(drilldown.totalInflow, drilldown.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Net activity</span>
                <strong>
                  {formatMoney(drilldown.netActivity, drilldown.currencyCode)}
                </strong>
              </div>
            </footer>
          </>
        ) : (
          <div className="budget-activity-empty">
            No register activity was found for this category in this month.
          </div>
        )}

        <div className="budget-activity-modal-note">
          Click a transaction to open its account register.
        </div>
      </section>
    </div>
  );
}

interface BudgetWorkspacePageProps {
  budgetId: string;
}

export function BudgetPage() {
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);

  if (!activeBudgetId) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Budget</h1>
            <p className="muted">No active budget is selected.</p>
          </div>
        </section>

        <Card>Open or create a budget before editing categories.</Card>
      </div>
    );
  }

  return <BudgetWorkspacePage budgetId={activeBudgetId} />;
}

function BudgetWorkspacePage({ budgetId }: BudgetWorkspacePageProps) {
  const navigate = useNavigate();
  const [hideArchivedCategories, setHideArchivedCategories] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryDragState, setCategoryDragState] =
    useState<BudgetCategoryDragState | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] =
    useState<BudgetCategoryDropTarget | null>(null);
  const [groupDragState, setGroupDragState] =
    useState<BudgetGroupDragState | null>(null);
  const [groupDropTarget, setGroupDropTarget] =
    useState<BudgetGroupDropTarget | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getCurrentBudgetMonth(),
  );

  const {
    data,
    isLoading,
    error,
    selectedCategory,
    selectedGroup,
    overassignedCategoryIds,
    selectCategory,
    updateAssigned,
    renameCategory,
    setCategoryArchived,
    moveCategoryToPosition,
    moveCategoryGroupToPosition,
    updateCategoryNote,
    activityDrilldown,
    isActivityDrilldownLoading,
    openActivityDrilldown,
    closeActivityDrilldown,
  } = useBudgetWorkspace(budgetId, selectedMonth);

  const budgetTableLayout = useTableLayout({
    storageKeyPrefix: BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
    scopeId: budgetId,
    columns: BUDGET_COLUMN_DEFINITIONS,
    minimumWidthRem: 30,
  });

  const isBudgetColumnVisible = useMemo(
    () => (columnId: BudgetColumnId) => budgetTableLayout.visibleColumnSet.has(columnId),
    [budgetTableLayout.visibleColumnSet],
  );

  useEffect(() => {
    if (!selectedCategory) {
      setIsCategoryManagerOpen(false);
    }
  }, [selectedCategory?.id]);

  if (isLoading) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Budget</h1>
            <p className="muted">Loading budget workspace…</p>
          </div>
        </section>

        <Card>Loading budget workspace.</Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Budget</h1>
            <p className="muted">Unable to load budget workspace.</p>
          </div>
        </section>

        <Card>{error ?? "Unknown error."}</Card>
      </div>
    );
  }

  const visibleCategoryGroups = hideArchivedCategories
    ? data.categoryGroups
        .map((group) => ({
          ...group,
          categories: group.categories.filter(
            (category) => !category.isArchived,
          ),
        }))
        .filter((group) => group.categories.length > 0)
    : data.categoryGroups;

  const hiddenArchivedCount = data.categoryGroups.reduce(
    (count, group) =>
      count + group.categories.filter((category) => category.isArchived).length,
    0,
  );

  const selectedCategoryVisible =
    selectedCategory !== null &&
    !(hideArchivedCategories && selectedCategory.isArchived);
  const visibleSelectedCategory = selectedCategoryVisible
    ? selectedCategory
    : null;
  const visibleSelectedGroup = selectedCategoryVisible ? selectedGroup : null;

  const isBudgetOverassigned = isMoneyNegative(data.readyToAssign);
  const selectedCategoryIsOverassignedSource =
    visibleSelectedCategory !== null &&
    overassignedCategoryIds.includes(visibleSelectedCategory.id);

  const overspentCount = data.categoryGroups.reduce(
    (count, group) =>
      count +
      group.categories.filter((category) => isMoneyNegative(category.available)).length,
    0,
  );

  function startCategoryDrag(categoryId: string, groupId: string) {
    setGroupDragState(null);
    setGroupDropTarget(null);
    setCategoryDragState({ categoryId, groupId });
    setCategoryDropTarget(null);
  }

  function updateCategoryDropTarget(
    event: DragEvent<HTMLButtonElement>,
    targetCategoryId: string,
    targetGroupId: string,
  ) {
    if (!categoryDragState) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (categoryDragState.categoryId === targetCategoryId) {
      setCategoryDropTarget(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2
      ? "before"
      : "after";

    setCategoryDropTarget({ categoryId: targetCategoryId, position });
  }

  function dropCategory(targetCategoryId: string, targetGroupId: string) {
    if (
      categoryDragState &&
      categoryDragState.categoryId !== targetCategoryId &&
      categoryDropTarget?.categoryId === targetCategoryId
    ) {
      moveCategoryToPosition(
        categoryDragState.categoryId,
        targetCategoryId,
        categoryDropTarget.position,
      );
    }

    setCategoryDragState(null);
    setCategoryDropTarget(null);
  }

  function endCategoryDrag() {
    setCategoryDragState(null);
    setCategoryDropTarget(null);
  }

  function startCategoryGroupDrag(groupId: string) {
    setCategoryDragState(null);
    setCategoryDropTarget(null);
    setGroupDragState({ groupId });
    setGroupDropTarget(null);
  }

  function updateCategoryGroupDropTarget(
    event: DragEvent<HTMLDivElement>,
    targetGroupId: string,
  ) {
    if (!groupDragState) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (groupDragState.groupId === targetGroupId) {
      setGroupDropTarget(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2
      ? "before"
      : "after";

    setGroupDropTarget({ groupId: targetGroupId, position });
  }

  function dropCategoryGroup(targetGroupId: string) {
    if (
      groupDragState &&
      groupDragState.groupId !== targetGroupId &&
      groupDropTarget?.groupId === targetGroupId
    ) {
      moveCategoryGroupToPosition(
        groupDragState.groupId,
        targetGroupId,
        groupDropTarget.position,
      );
    }

    setGroupDragState(null);
    setGroupDropTarget(null);
  }

  function endCategoryGroupDrag() {
    setGroupDragState(null);
    setGroupDropTarget(null);
  }


  function openCategoryEditor(categoryId: string) {
    selectCategory(categoryId);
    setIsCategoryManagerOpen(true);
  }

  return (
    <div className="budget-workspace-screen">
      <div className="budget-workspace-layout budget-workspace-layout-interactive">
        <main className="budget-workspace-main">
          <div className="budget-sticky-working-header">
            <section className="budget-workspace-topbar">
              <div className="month-switcher">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() =>
                    setSelectedMonth((currentMonth) =>
                      getPreviousBudgetMonth(currentMonth),
                    )
                  }
                  title="Go to previous budget month"
                >
                  ‹
                </button>

                <div>
                  <h1>{data.monthLabel}</h1>
                  <p className="muted">Interactive budget workspace</p>
                </div>

                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() =>
                    setSelectedMonth((currentMonth) =>
                      getNextBudgetMonth(currentMonth),
                    )
                  }
                  title="Go to next budget month"
                >
                  ›
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setSelectedMonth(getCurrentBudgetMonth())}
                >
                  Back to today
                </button>
              </div>

              <div
                className={
                  isBudgetOverassigned
                    ? "ready-to-assign-pill ready-to-assign-negative"
                    : "ready-to-assign-pill"
                }
              >
                <span>Ready To Assign</span>
                <strong>{formatMoney(data.readyToAssign, data.currencyCode)}</strong>
              </div>
            </section>

            <section className="budget-display-bar" aria-label="Budget display options">
              <span className="budget-display-label">Display</span>
              <button
                className={
                  hideArchivedCategories
                    ? "budget-filter budget-filter-active"
                    : "budget-filter"
                }
                type="button"
                onClick={() => setHideArchivedCategories((current) => !current)}
                title={
                  hideArchivedCategories
                    ? "Show archived categories"
                    : "Hide archived categories"
                }
              >
                {hideArchivedCategories
                  ? `Archived hidden (${hiddenArchivedCount})`
                  : `Hide archived (${hiddenArchivedCount})`}
              </button>

              <button
                className="budget-filter budget-table-layout-reset"
                type="button"
                onClick={budgetTableLayout.resetColumnWidths}
                title="Reset Budget column widths"
              >
                Reset column widths
              </button>

              <span className="budget-table-layout-help">
                Drag header grips to resize columns.
              </span>
            </section>

            <div
              className="budget-workspace-table-head"
              style={budgetTableLayout.rowStyle}
            >
              {budgetTableLayout.visibleColumns.map((column) => (
                <span className="table-layout-resizable-head-cell" key={column.id}>
                  {column.label}
                  <ColumnResizeHandle
                    columnId={column.id}
                    label={column.label}
                    onResizeStart={budgetTableLayout.startColumnResize}
                    onNudgeColumnWidth={budgetTableLayout.nudgeColumnWidth}
                    onResetColumnWidth={budgetTableLayout.resetColumnWidth}
                  />
                </span>
              ))}
            </div>
          </div>

          <Card className="budget-workspace-table-card">
            {visibleCategoryGroups.map((group) => (
              <BudgetGroup
                key={group.id}
                group={group}
                currencyCode={data.currencyCode}
                selectedCategoryId={visibleSelectedCategory?.id ?? null}
                overassignedCategoryIds={overassignedCategoryIds}
                onSelectCategory={selectCategory}
                onOpenCategoryEditor={openCategoryEditor}
                onAssignedChange={updateAssigned}
                onActivityClick={openActivityDrilldown}
                dragState={categoryDragState}
                dropTarget={categoryDropTarget}
                isGroupDragSource={groupDragState?.groupId === group.id}
                groupDropPosition={
                  groupDropTarget?.groupId === group.id ? groupDropTarget.position : null
                }
                onGroupDragStart={startCategoryGroupDrag}
                onGroupDragOver={updateCategoryGroupDropTarget}
                onGroupDrop={dropCategoryGroup}
                onGroupDragEnd={endCategoryGroupDrag}
                onCategoryDragStart={startCategoryDrag}
                onCategoryDragOver={updateCategoryDropTarget}
                onCategoryDrop={dropCategory}
                onCategoryDragEnd={endCategoryDrag}
                isBudgetColumnVisible={isBudgetColumnVisible}
                rowStyle={budgetTableLayout.rowStyle}
              />
            ))}
          </Card>
        </main>

        <aside className="budget-month-panel">
          <Card className="month-overview-card">
            <div className="panel-section-header">
              <h2>Month Overview</h2>
              <p className="muted">{data.monthLabel}</p>
            </div>

            <div className="month-breakdown">
              <div>
                <span>Ready To Assign</span>
                <strong>
                  {formatMoney(data.readyToAssign, data.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Assigned</span>
                <strong>
                  {formatMoney(data.totalAssigned, data.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Activity</span>
                <strong>
                  {formatMoney(data.totalActivity, data.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Available</span>
                <strong>
                  {formatMoney(data.totalAvailable, data.currencyCode)}
                </strong>
              </div>
            </div>
          </Card>

          <CategoryInspector
            category={visibleSelectedCategory}
            group={visibleSelectedGroup}
            currencyCode={data.currencyCode}
            isOverassignedSource={selectedCategoryIsOverassignedSource}
            onSetCategoryArchived={setCategoryArchived}
            onOpenManageCategory={() => setIsCategoryManagerOpen(true)}
          />

          <Card className="budget-health-card">
            <div className="panel-section-header">
              <h2>Budget Health</h2>
              <p className="muted">Read-only summary</p>
            </div>

            <div className="health-row">
              <span>Overspent categories</span>
              <strong>{overspentCount}</strong>
            </div>

            <div className="health-row">
              <span>Future months</span>
              <strong>12 max</strong>
            </div>

            <div className="health-row">
              <span>Status</span>
              <strong>
                {isBudgetOverassigned
                  ? "Overassigned"
                  : overspentCount > 0
                    ? "Needs review"
                    : "Good"}
              </strong>
            </div>
          </Card>
        </aside>
      </div>


      <CategoryManagementDialog
        category={visibleSelectedCategory}
        group={visibleSelectedGroup}
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        onRenameCategory={renameCategory}
        onSetCategoryArchived={setCategoryArchived}
        onUpdateCategoryNote={updateCategoryNote}
      />
      <BudgetActivityDrilldownModal
        drilldown={activityDrilldown}
        isLoading={isActivityDrilldownLoading}
        onClose={closeActivityDrilldown}
        onTransactionClick={(row) => {
          closeActivityDrilldown();
          void navigate(`/accounts/${row.accountId}`);
        }}
      />
    </div>
  );
}
