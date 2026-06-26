import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  CategoryMergePreview,
} from "../features/budget/budgetViewTypes";
import { isMoneyNegative, isMoneyZero, normaliseMoney } from "../features/budget/moneyMath";
import { formatDateForDisplay } from "../features/settings/dateFormatting";
import { useDateFormatPreference } from "../features/settings/useDateFormatPreference";
import { ColumnResizeHandle } from "../features/tableLayout/ColumnResizeHandle";
import { useTableLayout, type TableColumnDefinition } from "../features/tableLayout/tableLayout";

type BudgetColumnId = "category" | "assigned" | "activity" | "available";

const BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX = "budget-app.budget-table-layout.v1";

const BUDGET_COLUMN_DEFINITIONS: readonly TableColumnDefinition<BudgetColumnId>[] = [
  { id: "category", label: "Category Group", template: "minmax(18rem, 1fr)", widthRem: 18 },
  { id: "assigned", label: "Assigned", template: "8.5rem", widthRem: 8.5 },
  { id: "activity", label: "Activity", template: "8.5rem", widthRem: 8.5 },
  { id: "available", label: "Available", template: "8.5rem", widthRem: 8.5 },
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
  currencyCode,
  isSelected,
  isOverassignedSource,
  onSelect,
  onAssignedChange,
  onActivityClick,
  isBudgetColumnVisible,
  rowStyle,
}: {
  category: BudgetCategoryView;
  currencyCode: string;
  isSelected: boolean;
  isOverassignedSource: boolean;
  onSelect: () => void;
  onAssignedChange: (value: number) => void;
  onActivityClick: () => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={[
        "budget-workspace-row interactive-budget-row",
        isSelected ? "budget-workspace-row-selected" : "",
      ].join(" ")}
      onClick={onSelect}
      style={rowStyle}
    >
      <div className="budget-category-cell">
        <span className="drag-handle" title="Reorder categories later">
          ⋮⋮
        </span>
        <strong className="budget-category-name">{category.name}</strong>
        {category.isArchived ? (
          <span className="category-archived-badge">Archived</span>
        ) : null}
        {category.note?.trim() ? (
          <span className="category-note-badge" title="Category has notes">Note</span>
        ) : null}
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
  onAssignedChange,
  onActivityClick,
  isBudgetColumnVisible,
  rowStyle,
}: {
  group: BudgetCategoryGroupView;
  currencyCode: string;
  selectedCategoryId: string | null;
  overassignedCategoryIds: string[];
  onSelectCategory: (categoryId: string) => void;
  onAssignedChange: (categoryId: string, value: number) => void;
  onActivityClick: (categoryId: string) => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
}) {
  const groupHasOverassignedCategory = group.categories.some((category) =>
    overassignedCategoryIds.includes(category.id),
  );

  return (
    <section className="budget-workspace-group">
      <div className="budget-workspace-group-header" style={rowStyle}>
        <div className="budget-group-title">
          <span>⌄</span>
          <strong>{group.name}</strong>
          {group.note?.trim() ? (
            <span className="category-note-badge" title="Category group has notes">Note</span>
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
            currencyCode={currencyCode}
            isSelected={selectedCategoryId === category.id}
            isOverassignedSource={isOverassignedSource}
            onSelect={() => onSelectCategory(category.id)}
            onAssignedChange={(value) => onAssignedChange(category.id, value)}
            onActivityClick={() => onActivityClick(category.id)}
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
  canMoveCategoryUp,
  canMoveCategoryDown,
  canMoveGroupUp,
  canMoveGroupDown,
  mergeTargetOptions,
  mergePreview,
  isMergePreviewLoading,
  onRenameCategory,
  onSetCategoryArchived,
  onMoveCategory,
  onMoveCategoryGroup,
  onPreviewCategoryMerge,
  onMergeCategory,
  onClearCategoryMergePreview,
  onUpdateCategoryNote,
  onUpdateCategoryGroupNote,
}: {
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  currencyCode: string;
  isOverassignedSource: boolean;
  canMoveCategoryUp: boolean;
  canMoveCategoryDown: boolean;
  canMoveGroupUp: boolean;
  canMoveGroupDown: boolean;
  mergeTargetOptions: Array<{ id: string; name: string; groupName: string }>;
  mergePreview: CategoryMergePreview | null;
  isMergePreviewLoading: boolean;
  onRenameCategory: (categoryId: string, name: string) => void;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  onMoveCategory: (categoryId: string, direction: "up" | "down") => void;
  onMoveCategoryGroup: (groupId: string, direction: "up" | "down") => void;
  onPreviewCategoryMerge: (
    sourceCategoryId: string,
    targetCategoryId: string,
  ) => void;
  onMergeCategory: (sourceCategoryId: string, targetCategoryId: string) => void;
  onClearCategoryMergePreview: () => void;
  onUpdateCategoryNote: (categoryId: string, note: string) => void;
  onUpdateCategoryGroupNote: (groupId: string, note: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(category?.name ?? "");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [draftCategoryNote, setDraftCategoryNote] = useState(category?.note ?? "");
  const [draftGroupNote, setDraftGroupNote] = useState(group?.note ?? "");

  useEffect(() => {
    setDraftName(category?.name ?? "");
    setIsRenaming(false);
    setMergeTargetId("");
    setDraftCategoryNote(category?.note ?? "");
    setDraftGroupNote(group?.note ?? "");
  }, [category?.id, category?.name, category?.note, group?.id, group?.note]);

  function startRename() {
    if (!category) {
      return;
    }

    setDraftName(category.name);
    setIsRenaming(true);
  }

  function cancelRename() {
    setDraftName(category?.name ?? "");
    setIsRenaming(false);
  }

  function saveRename() {
    if (!category) {
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setDraftName(category.name);
      setIsRenaming(false);
      return;
    }

    if (trimmedName !== category.name) {
      onRenameCategory(category.id, trimmedName);
    }

    setIsRenaming(false);
  }
  function saveCategoryNote() {
    if (!category) {
      return;
    }

    if (draftCategoryNote !== (category.note ?? "")) {
      onUpdateCategoryNote(category.id, draftCategoryNote);
    }
  }

  function saveGroupNote() {
    if (!group) {
      return;
    }

    if (draftGroupNote !== (group.note ?? "")) {
      onUpdateCategoryGroupNote(group.id, draftGroupNote);
    }
  }

  function previewMerge() {
    if (!category || !mergeTargetId) {
      return;
    }

    onPreviewCategoryMerge(category.id, mergeTargetId);
  }

  function mergeCategory() {
    if (!category || !activeMergePreview) {
      return;
    }

    const confirmed = confirmDialog({
      title: `Merge ${activeMergePreview.sourceCategoryName} into ${activeMergePreview.targetCategoryName}?`,
      message:
        "This will reassign matching register and scheduled transactions, move assigned money to the target category, and archive the source category.",
    });

    if (!confirmed) {
      return;
    }

    onMergeCategory(
      activeMergePreview.sourceCategoryId,
      activeMergePreview.targetCategoryId,
    );
  }

  const activeMergePreview =
    mergePreview && category
      ? mergePreview.sourceCategoryId === category.id
        ? mergePreview
        : null
      : null;

  if (!category || !group) {
    return (
      <Card className="budget-inspector-card">
        <div className="panel-section-header">
          <h2>Inspector</h2>
          <p className="muted">Select a category to inspect it.</p>
        </div>

        <div className="inspector-empty">
          Click a budget category to see details here.
        </div>
      </Card>
    );
  }

  return (
    <Card className="budget-inspector-card">
      <div className="panel-section-header category-inspector-header">
        <div>
          {isRenaming ? (
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
          ) : (
            <h2>{category.name}</h2>
          )}
          <p className="muted">
            {group.name}
            {category.isArchived ? " · Archived" : ""}
          </p>
        </div>

        <div className="category-inspector-actions">
          <button
            className="button button-secondary category-rename-button"
            type="button"
            onMouseDown={(event) => {
              if (isRenaming) {
                event.preventDefault();
              }
            }}
            onClick={isRenaming ? saveRename : startRename}
          >
            {isRenaming ? "Save" : "Rename"}
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveCategoryUp}
            onClick={() => onMoveCategory(category.id, "up")}
            title="Move category up"
          >
            ↑
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveCategoryDown}
            onClick={() => onMoveCategory(category.id, "down")}
            title="Move category down"
          >
            ↓
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveGroupUp}
            onClick={() => onMoveCategoryGroup(group.id, "up")}
            title="Move category group up"
          >
            Group ↑
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveGroupDown}
            onClick={() => onMoveCategoryGroup(group.id, "down")}
            title="Move category group down"
          >
            Group ↓
          </button>

          <button
            className="button button-secondary category-archive-button"
            type="button"
            onClick={() =>
              onSetCategoryArchived(category.id, !category.isArchived)
            }
          >
            {category.isArchived ? "Restore" : "Archive"}
          </button>
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
          <strong>
            {isMoneyNegative(category.available)
              ? "Overspent"
              : isOverassignedSource
                ? "Overbudgeted"
                : "Available"}
          </strong>
        </div>
      </div>

      <div className="inspector-note">
        <h3>Merge preview</h3>
        <p className="muted">
          Preview how many register and scheduled entries would be affected
          before we add the actual merge action. This does not change any data.
        </p>

        <div className="category-merge-preview-controls">
          <select
            className="category-rename-input"
            value={mergeTargetId}
            onChange={(event) => {
              setMergeTargetId(event.target.value);
              onClearCategoryMergePreview();
            }}
            aria-label="Merge target category"
          >
            <option value="">Merge into…</option>
            {mergeTargetOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.groupName}
              </option>
            ))}
          </select>

          <button
            className="button button-secondary"
            type="button"
            disabled={!mergeTargetId || isMergePreviewLoading}
            onClick={previewMerge}
          >
            {isMergePreviewLoading ? "Previewing…" : "Preview"}
          </button>
        </div>

        {activeMergePreview ? (
          <div className="category-merge-preview-summary">
            <p>
              <strong>{activeMergePreview.sourceCategoryName}</strong> would
              merge into{" "}
              <strong>{activeMergePreview.targetCategoryName}</strong>.
            </p>
            <p className="muted">
              Register transactions:{" "}
              {activeMergePreview.registerTransactionCount}
              {" · "}Split lines: {activeMergePreview.registerSplitLineCount}
              {" · "}Scheduled transactions:{" "}
              {activeMergePreview.scheduledTransactionCount}
            </p>
            <p className="muted">
              Assigned after merge:{" "}
              {formatMoney(activeMergePreview.combinedAssigned, currencyCode)}
              {" · "}Activity after merge:{" "}
              {formatMoney(activeMergePreview.combinedActivity, currencyCode)}
              {" · "}Available after merge:{" "}
              {formatMoney(activeMergePreview.combinedAvailable, currencyCode)}
            </p>
            <button
              className="button button-secondary"
              type="button"
              onClick={mergeCategory}
            >
              Merge now
            </button>
          </div>
        ) : null}
      </div>

      <div className="inspector-note category-notes-editor">
        <h3>Category notes</h3>
        <p className="muted">
          Notes are stored on the individual category and are preserved for future YNAB4 import mapping.
        </p>
        <textarea
          className="category-note-textarea"
          value={draftCategoryNote}
          onChange={(event) => setDraftCategoryNote(event.target.value)}
          onBlur={saveCategoryNote}
          placeholder="Add reminders, rules, renewal dates, or category-specific instructions…"
          rows={5}
        />
      </div>

      <div className="inspector-note category-notes-editor">
        <h3>Category group notes</h3>
        <p className="muted">
          YNAB4 category headers can also have notes, so this group-level note is preserved separately.
        </p>
        <textarea
          className="category-note-textarea"
          value={draftGroupNote}
          onChange={(event) => setDraftGroupNote(event.target.value)}
          onBlur={saveGroupNote}
          placeholder="Add notes that apply to this whole category group…"
          rows={4}
        />
      </div>
    </Card>
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
    moveCategory,
    moveCategoryGroup,
    updateCategoryNote,
    updateCategoryGroupNote,
    categoryMergePreview,
    isCategoryMergePreviewLoading,
    activityDrilldown,
    isActivityDrilldownLoading,
    openActivityDrilldown,
    closeActivityDrilldown,
    previewCategoryMerge,
    mergeCategory,
    clearCategoryMergePreview,
  } = useBudgetWorkspace(budgetId, selectedMonth);

  const budgetTableLayout = useTableLayout({
    storageKeyPrefix: BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
    scopeId: budgetId,
    columns: BUDGET_COLUMN_DEFINITIONS,
    minimumWidthRem: 36,
  });

  const isBudgetColumnVisible = useMemo(
    () => (columnId: BudgetColumnId) => budgetTableLayout.visibleColumnSet.has(columnId),
    [budgetTableLayout.visibleColumnSet],
  );

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

  const selectedCategoryIndex =
    visibleSelectedCategory && visibleSelectedGroup
      ? visibleSelectedGroup.categories.findIndex(
          (category) => category.id === visibleSelectedCategory.id,
        )
      : -1;
  const canMoveSelectedCategoryUp = selectedCategoryIndex > 0;
  const canMoveSelectedCategoryDown =
    visibleSelectedGroup !== null &&
    selectedCategoryIndex >= 0 &&
    selectedCategoryIndex < visibleSelectedGroup.categories.length - 1;

  const selectedGroupIndex =
    visibleSelectedGroup !== null
      ? data.categoryGroups.findIndex(
          (group) => group.id === visibleSelectedGroup.id,
        )
      : -1;
  const canMoveSelectedGroupUp = selectedGroupIndex > 0;
  const canMoveSelectedGroupDown =
    selectedGroupIndex >= 0 &&
    selectedGroupIndex < data.categoryGroups.length - 1;

  const mergeTargetOptions = data.categoryGroups.flatMap((group) =>
    group.categories
      .filter((category) => category.id !== visibleSelectedCategory?.id)
      .map((category) => ({
        id: category.id,
        name: category.name,
        groupName: group.name,
      })),
  );

  const overspentCount = data.categoryGroups.reduce(
    (count, group) =>
      count +
      group.categories.filter((category) => isMoneyNegative(category.available)).length,
    0,
  );

  return (
    <div className="budget-workspace-screen">
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

      <div className="budget-workspace-layout budget-workspace-layout-interactive">
        <main className="budget-workspace-main">
          <section className="budget-filter-bar">
            <button
              className="budget-filter budget-filter-active"
              type="button"
            >
              All
            </button>
            <button className="budget-filter" type="button">
              Overspent
            </button>
            <button className="budget-filter" type="button">
              Money Available
            </button>
            <button className="budget-filter" type="button">
              Needs Money
            </button>
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

            <div className="budget-filter-spacer" />

            <input
              className="budget-search"
              placeholder="Search categories…"
              aria-label="Search categories"
            />
          </section>

          <Card className="budget-workspace-table-card">
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

            {visibleCategoryGroups.map((group) => (
              <BudgetGroup
                key={group.id}
                group={group}
                currencyCode={data.currencyCode}
                selectedCategoryId={visibleSelectedCategory?.id ?? null}
                overassignedCategoryIds={overassignedCategoryIds}
                onSelectCategory={selectCategory}
                onAssignedChange={updateAssigned}
                onActivityClick={openActivityDrilldown}
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
            canMoveCategoryUp={canMoveSelectedCategoryUp}
            canMoveCategoryDown={canMoveSelectedCategoryDown}
            canMoveGroupUp={canMoveSelectedGroupUp}
            canMoveGroupDown={canMoveSelectedGroupDown}
            mergeTargetOptions={mergeTargetOptions}
            mergePreview={categoryMergePreview}
            isMergePreviewLoading={isCategoryMergePreviewLoading}
            onRenameCategory={renameCategory}
            onSetCategoryArchived={setCategoryArchived}
            onMoveCategory={moveCategory}
            onMoveCategoryGroup={moveCategoryGroup}
            onPreviewCategoryMerge={previewCategoryMerge}
            onMergeCategory={mergeCategory}
            onClearCategoryMergePreview={clearCategoryMergePreview}
            onUpdateCategoryNote={updateCategoryNote}
            onUpdateCategoryGroupNote={updateCategoryGroupNote}
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
