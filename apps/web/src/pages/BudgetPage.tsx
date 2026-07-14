import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
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
import { formatDateForDisplay } from "../features/settings/dateFormatting";
import { useDateFormatPreference } from "../features/settings/useDateFormatPreference";
import { ColumnResizeHandle } from "../features/tableLayout/ColumnResizeHandle";
import { useTableLayout, type TableColumnDefinition } from "../features/tableLayout/tableLayout";
import { isCreditCardPaymentCategory, isCreditCardPaymentGroup } from "../features/budget/creditCardPaymentCategories";
import { formatMoney, getAvailableClass } from "../features/budget/budgetMoneyDisplay";
import { isMoneyNegative } from "../features/budget/moneyMath";
import {
  buildOverspendingCoverOptions,
  countArchivedCategories,
  countOverspentCategories,
  getVisibleCategoryGroups,
} from "../features/budget/budgetWorkspaceSelectors";
import { buildBudgetInspectorState } from "../features/budget/budgetInspectorState";
import { BudgetCategoryContextMenu } from "../features/budget/BudgetCategoryContextMenu";
import { BudgetCoverOverspendingMenu } from "../features/budget/BudgetCoverOverspendingMenu";
import { resolveFloatingPositionFromMouseEvent, type FloatingPosition } from "../features/floatingUi";
import {
  BudgetGroup,
  type BudgetColumnId,
} from "../features/budget/BudgetWorkspaceGroup";

const BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX = "budget-app.budget-table-layout.v1";
const BUDGET_COLLAPSED_GROUPS_STORAGE_KEY_PREFIX =
  "budget-app.budget-collapsed-groups.v1";

function readCollapsedBudgetGroupIds(budgetId: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  const stored = window.localStorage.getItem(
    `${BUDGET_COLLAPSED_GROUPS_STORAGE_KEY_PREFIX}.${budgetId}`,
  );

  if (!stored) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(stored);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeCollapsedBudgetGroupIds(
  budgetId: string,
  collapsedGroupIds: ReadonlySet<string>,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    `${BUDGET_COLLAPSED_GROUPS_STORAGE_KEY_PREFIX}.${budgetId}`,
    JSON.stringify([...collapsedGroupIds]),
  );
}

const BUDGET_COLUMN_DEFINITIONS: readonly TableColumnDefinition<BudgetColumnId>[] = [
  { id: "category", label: "Category Group", template: "minmax(15rem, 1fr)", widthRem: 15 },
  { id: "assigned", label: "Assigned", template: "7rem", widthRem: 7 },
  { id: "activity", label: "Activity", template: "7rem", widthRem: 7 },
  { id: "available", label: "Available", template: "7rem", widthRem: 7 },
];

function CategoryInspector({
  category,
  group,
  currencyCode,
  isOverassignedSource,
  onSetCategoryArchived,
  onOpenManageCategory,
  isCreditCardPaymentCategory,
}: {
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  currencyCode: string;
  isOverassignedSource: boolean;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  onOpenManageCategory: () => void;
  isCreditCardPaymentCategory: boolean;
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
            {isCreditCardPaymentCategory ? " · Managed" : ""}
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

      {isCreditCardPaymentCategory ? (
        <div className="inspector-note category-details-note-summary">
          <h3>Managed category</h3>
          <p className="muted">
            This category is created by credit card payment funding. It tracks
            money reserved to pay this card and cannot be renamed or archived.
          </p>
        </div>
      ) : (
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
      )}
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

  if (!isOpen || !category || !group || isCreditCardPaymentCategory(category.id)) {
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
  const [budgetContextMenu, setBudgetContextMenu] = useState<{
    category: BudgetCategoryView;
    group: BudgetCategoryGroupView;
    position: Pick<FloatingPosition, "top" | "left">;
  } | null>(null);
  const [coverOverspendingMenu, setCoverOverspendingMenu] = useState<{
    category: BudgetCategoryView;
    position: Pick<FloatingPosition, "top" | "left">;
  } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getCurrentBudgetMonth(),
  );
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() =>
    readCollapsedBudgetGroupIds(budgetId),
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
    coverOverspending,
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

  useEffect(() => {
    setCollapsedGroupIds(readCollapsedBudgetGroupIds(budgetId));
  }, [budgetId]);

  function toggleBudgetGroup(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      writeCollapsedBudgetGroupIds(budgetId, next);
      return next;
    });
  }

  const visibleCategoryGroups = data
    ? getVisibleCategoryGroups(data.categoryGroups, hideArchivedCategories)
    : [];

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

  const hiddenArchivedCount = countArchivedCategories(data.categoryGroups);

  const {
    visibleSelectedCategory,
    visibleSelectedGroup,
    selectedCategoryIsOverassignedSource,
  } = buildBudgetInspectorState({
    selectedCategory,
    selectedGroup,
    hideArchivedCategories,
    overassignedCategoryIds,
  });

  const isBudgetOverassigned = isMoneyNegative(data.readyToAssign);

  const overspentCount = countOverspentCategories(data.categoryGroups);

  const coverOptions = buildOverspendingCoverOptions(data.categoryGroups);

  function openCategoryEditor(categoryId: string) {
    if (isCreditCardPaymentCategory(categoryId)) {
      selectCategory(categoryId);
      return;
    }

    selectCategory(categoryId);
    setIsCategoryManagerOpen(true);
  }

  function closeBudgetContextMenu() {
    setBudgetContextMenu(null);
  }

  function closeCoverOverspendingMenu() {
    setCoverOverspendingMenu(null);
  }

  function openBudgetContextMenu({
    event,
    category,
    group,
  }: {
    event: MouseEvent<HTMLElement>;
    category: BudgetCategoryView;
    group: BudgetCategoryGroupView;
  }) {
    setBudgetContextMenu({
      category,
      group,
      position: resolveFloatingPositionFromMouseEvent(event.nativeEvent, {
        floatingSize: { width: 260, height: 260 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    });
  }

  function openCoverOverspendingMenu(categoryId: string) {
    const category = budgetContextMenu?.category;

    if (!category || category.id !== categoryId) {
      return;
    }

    setCoverOverspendingMenu({
      category,
      position: budgetContextMenu.position,
    });
  }

  function openCoverOverspendingMenuFromRow({
    event,
    category,
  }: {
    event: MouseEvent<HTMLElement>;
    category: BudgetCategoryView;
  }) {
    selectCategory(category.id);
    setCoverOverspendingMenu({
      category,
      position: resolveFloatingPositionFromMouseEvent(event.nativeEvent, {
        floatingSize: { width: 360, height: 320 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    });
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
                    onOpenCategoryContextMenu={openBudgetContextMenu}
                    onOpenCoverOverspending={openCoverOverspendingMenuFromRow}
                    onAssignedChange={updateAssigned}
                    onActivityClick={openActivityDrilldown}
                    isBudgetColumnVisible={isBudgetColumnVisible}
                    rowStyle={budgetTableLayout.rowStyle}
                    isCreditCardPaymentGroup={isCreditCardPaymentGroup(group.id)}
                    isCollapsed={collapsedGroupIds.has(group.id)}
                    onToggleCollapsed={() => toggleBudgetGroup(group.id)}
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
            isCreditCardPaymentCategory={
              visibleSelectedCategory !== null &&
              isCreditCardPaymentCategory(visibleSelectedCategory.id)
            }
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
      <BudgetCategoryContextMenu
        isOpen={Boolean(budgetContextMenu)}
        position={budgetContextMenu?.position ?? null}
        category={budgetContextMenu?.category ?? null}
        group={budgetContextMenu?.group ?? null}
        hasActivity={(budgetContextMenu?.category.activity ?? 0) !== 0}
        onClose={closeBudgetContextMenu}
        onOpenActivity={openActivityDrilldown}
        onOpenCoverOverspending={openCoverOverspendingMenu}
        onOpenManageCategory={openCategoryEditor}
        onRenameCategory={openCategoryEditor}
        onSetCategoryArchived={setCategoryArchived}
      />
      <BudgetCoverOverspendingMenu
        isOpen={Boolean(coverOverspendingMenu)}
        position={coverOverspendingMenu?.position ?? null}
        overspentCategory={coverOverspendingMenu?.category ?? null}
        coverOptions={coverOptions}
        currencyCode={data.currencyCode}
        onClose={closeCoverOverspendingMenu}
        onCoverOverspending={(input) => {
          closeCoverOverspendingMenu();
          coverOverspending(input);
        }}
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
