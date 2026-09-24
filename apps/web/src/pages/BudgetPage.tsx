import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { promptDialog } from "../features/ui/appDialogService";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CircleAlert, CircleCheck, CircleDollarSign, ListTree, Plus, Redo2, Undo2 } from "lucide-react";
import { Card } from "../components/ui/Card";
import "../styles/budgetWorkspace.css";
import {
  WorkspaceBody,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceStickyHeader,
} from "../components/workspace";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import {
  getBudgetMonthWindow,
  getCurrentBudgetMonth,
  getNextBudgetMonth,
  getPreviousBudgetMonth,
} from "../features/budget/budgetMonthNavigation";
import { useBudgetWorkspace } from "../features/budget/useBudgetWorkspace";
import { useBudgetView } from "../features/budget/useBudgetView";
import { useApplicationHistory } from "../features/history";
import { prefetchBudgetMonthQuery, useCategoryActivityDrilldownQuery } from "../features/persistence/reactiveQueries";
import { readAuthoritativeBudgetSummary } from "../features/budget/authoritativeBudgetSummary";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import type {
  BudgetActivityDrilldown,
  BudgetActivityDrilldownRow,
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
} from "../features/budget/budgetViewTypes";
import { formatDateForDisplay } from "../features/settings/dateFormatting";
import { useDateFormatPreference } from "../features/settings/useDateFormatPreference";
import { ColumnResizeHandle } from "../features/tableLayout/ColumnResizeHandle";
import { useTableLayout, type TableColumnDefinition } from "../features/tableLayout/tableLayout";
import { isCreditCardPaymentCategory, isCreditCardPaymentGroup } from "../features/budget/creditCardPaymentCategories";
import { formatMoney, getAvailableClass } from "../features/budget/budgetMoneyDisplay";
import { isMoneyNegative, isMoneyZero } from "../features/budget/moneyMath";
import { resolveBudgetNextMonthOutlook } from "../features/budget/budgetNextMonthOutlook";
import {
  ARCHIVED_CATEGORIES_GROUP_ID,
  buildArchivedCategoriesGroup,
  buildArchivedCategorySourceGroupMap,
  buildOverspendingCoverOptions,
  getActiveCategoryGroups,
} from "../features/budget/budgetWorkspaceSelectors";
import { buildBudgetInspectorState } from "../features/budget/budgetInspectorState";
import { BudgetCategoryContextMenu } from "../features/budget/BudgetCategoryContextMenu";
import {
  BudgetCategoryWindow,
} from "../features/budget/BudgetCategoryWindow";
import {
  resolveBudgetCategoryWindowTab,
  type BudgetCategoryWindowTab,
} from "../features/budget/budgetCategoryWindowState";
import { resolveFloatingPositionFromMouseEvent, type FloatingPosition } from "../features/floatingUi";
import {
  BudgetGroup,
  type BudgetColumnId,
  type BudgetGridStyle,
} from "../features/budget/BudgetWorkspaceGroup";
import { OrganiseCategoriesDialog } from "../features/budget/OrganiseCategoriesDialog";
import { BudgetVirtualizedGroupList } from "../features/budget/BudgetVirtualizedGroupList";
import { CategoryGoalInspectorSection } from "../features/goals/CategoryGoalInspectorSection";
const BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX = "budget-app.budget-table-layout.v1";
const BUDGET_COLLAPSED_GROUPS_STORAGE_KEY_PREFIX =
  "budget-app.budget-collapsed-groups.v1";
const BUDGET_ARCHIVED_CATEGORIES_EXPANDED_STORAGE_KEY_PREFIX =
  "budget-app.budget-archived-categories-expanded.v1";

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

function readArchivedCategoriesExpanded(budgetId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(
    `${BUDGET_ARCHIVED_CATEGORIES_EXPANDED_STORAGE_KEY_PREFIX}.${budgetId}`,
  ) === "true";
}

function writeArchivedCategoriesExpanded(budgetId: string, isExpanded: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${BUDGET_ARCHIVED_CATEGORIES_EXPANDED_STORAGE_KEY_PREFIX}.${budgetId}`,
    String(isExpanded),
  );
}

const BUDGET_COLUMN_DEFINITIONS: readonly TableColumnDefinition<BudgetColumnId>[] = [
  { id: "category", label: "Category", template: "minmax(15rem, 42rem)", widthRem: 15 },
  { id: "assigned", label: "Assigned", template: "7rem", widthRem: 7 },
  { id: "activity", label: "Activity", template: "7rem", widthRem: 7 },
  { id: "available", label: "Available", template: "7rem", widthRem: 7 },
];

const BUDGET_MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;


function BudgetNextMonthOutlook({
  data,
  isLoading,
  error,
  currencyCode,
  onOpen,
}: {
  data: BudgetMonthView | null;
  isLoading: boolean;
  error: string | null;
  currencyCode: string;
  onOpen: () => void;
}) {
  const outlook = data
    ? resolveBudgetNextMonthOutlook(data.readyToAssign)
    : null;
  const monthName = data?.monthLabel.split(" ")[0] ?? "Next month";
  const statusClass = outlook
    ? `budget-next-month-outlook-${outlook.status}`
    : "budget-next-month-outlook-neutral";

  let primary = "Calculating…";
  let secondary = "Reading the next budget month.";

  if (error) {
    primary = "Outlook unavailable";
    secondary = "Open the next month to review it.";
  } else if (data && outlook) {
    if (outlook.status === "balanced") {
      primary = "Balanced";
      secondary = "Based on your current budget";
    } else if (outlook.status === "overbudget") {
      primary = `${formatMoney(outlook.amount, currencyCode)} overbudget`;
      secondary = "Based on your current budget";
    } else {
      primary = `${formatMoney(outlook.amount, currencyCode)} available`;
      secondary = "Based on your current budget";
    }
  } else if (!isLoading) {
    primary = "Outlook unavailable";
    secondary = "Open the next month to review it.";
  }

  const StatusIcon = outlook?.status === "overbudget" ? CircleAlert : CircleCheck;

  return (
    <button
      className={`budget-next-month-outlook ${statusClass}`}
      type="button"
      onClick={onOpen}
      aria-label={`Open ${data?.monthLabel ?? "next month"} budget. ${primary}.`}
    >
      <span className="budget-next-month-outlook-icon" aria-hidden="true">
        <StatusIcon size={22} />
      </span>
      <span className="budget-next-month-outlook-kicker">Next month</span>
      <span className="budget-next-month-outlook-label">{monthName} outlook</span>
      <strong>{primary}</strong>
      <span className="budget-next-month-outlook-support">{secondary}</span>
      {data ? (
        <span className="budget-next-month-outlook-assigned">
          <span>Assigned in {monthName}</span>
          <strong>{formatMoney(data.totalAssigned, currencyCode)}</strong>
        </span>
      ) : null}
      <span className="budget-next-month-outlook-arrow" aria-hidden="true">›</span>
    </button>
  );
}

type CategoryDetailsTab = "overview" | "goal" | "activity" | "notes";

function CategoryDetailsPanel({
  budgetId,
  month,
  category,
  group,
  currencyCode,
  isOverassignedSource,
  isCreditCardPaymentCategory,
  onAssignGoalRecommendation,
  onOpenActivity,
  onOpenManageCategory,
  onOpenCoverOverspending,
  onClose,
}: {
  budgetId: string;
  month: string;
  category: BudgetCategoryView;
  group: BudgetCategoryGroupView;
  currencyCode: string;
  isOverassignedSource: boolean;
  isCreditCardPaymentCategory: boolean;
  onAssignGoalRecommendation: ReturnType<typeof useBudgetWorkspace>["assignGoalRecommendation"];
  onOpenActivity: (categoryId: string) => void;
  onOpenManageCategory: (categoryId: string) => void;
  onOpenCoverOverspending: (categoryId: string) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<CategoryDetailsTab>("overview");
  const dateFormat = useDateFormatPreference();
  const activityQuery = useCategoryActivityDrilldownQuery({
    budgetId,
    month,
    categoryId: category.id,
  });

  useEffect(() => {
    setActiveTab("overview");
  }, [category.id]);

  const goal = category.goal;
  const recentActivity = (activityQuery.data?.rows ?? []).slice(0, 3);
  const hasNotes = Boolean(category.note?.trim() || group.note?.trim());
  const canCoverOverspending =
    !isCreditCardPaymentCategory &&
    !category.isArchived &&
    isMoneyNegative(category.available);
  const goalTarget = goal?.goal.targetAmount ?? 0;
  const goalProgress = goal?.percentComplete ?? 0;

  return (
    <aside
      className="budget-category-details-panel"
      aria-label={`Category details for ${category.name}`}
    >
      <header className="budget-category-details-header">
        <h2>Category Details</h2>
        <button
          className="budget-category-details-close"
          type="button"
          onClick={onClose}
          aria-label="Close category details"
          title="Close category details"
        >
          ×
        </button>
      </header>

      <section className="budget-category-details-identity">
        <div className="budget-category-details-identity-main">
          <span className="budget-category-details-category-icon" aria-hidden="true">⌂</span>
          <div>
            <h3>{category.name}</h3>
            <p>{group.name}</p>
          </div>
        </div>
        {!isCreditCardPaymentCategory ? (
          <button
            className="budget-category-details-edit"
            type="button"
            onClick={() => onOpenManageCategory(category.id)}
          >
            Edit
          </button>
        ) : null}
      </section>

      <nav className="budget-category-details-tabs" aria-label="Category detail sections">
        {(["overview", "goal", "activity", "notes"] as const).map((tab) => (
          <button
            className={
              activeTab === tab
                ? "budget-category-details-tab budget-category-details-tab-active"
                : "budget-category-details-tab"
            }
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-current={activeTab === tab ? "page" : undefined}
          >
            {tab === "overview"
              ? "Overview"
              : tab === "goal"
                ? "Goal"
                : tab === "activity"
                  ? "Activity"
                  : "Notes"}
          </button>
        ))}
      </nav>

      <div className="budget-category-details-content">
        {activeTab === "overview" ? (
          <>
            <section className="budget-category-details-summary-card" aria-label="Category amounts">
              <div className="budget-category-details-summary-row budget-category-details-summary-row-available">
                <span>Available</span>
                <strong className={getAvailableClass(category.available, isOverassignedSource)}>
                  {formatMoney(category.available, currencyCode)}
                </strong>
              </div>
              <div className="budget-category-details-summary-row">
                <span>Assigned</span>
                <strong>{formatMoney(category.assigned, currencyCode)}</strong>
              </div>
              <div className="budget-category-details-summary-row">
                <span>Activity</span>
                <strong>{formatMoney(category.activity, currencyCode)}</strong>
              </div>
            </section>

            {goal && !isCreditCardPaymentCategory ? (
              <section className="budget-category-details-goal-summary">
                <div className="budget-category-details-goal-target">
                  <span>
                    {goal.goal.type === "monthly-funding" ? "Target (Monthly)" : "Target"}
                  </span>
                  <strong>{formatMoney(goalTarget, currencyCode)}</strong>
                </div>
                <div className="budget-category-details-goal-progress-row">
                  <span>Funding progress</span>
                  <div className="budget-category-details-goal-progress">
                    <span style={{ width: `${Math.min(100, goalProgress)}%` }} />
                  </div>
                  <div className="budget-category-details-goal-progress-meta">
                    <span>
                      {formatMoney(goal.progressAmount, currencyCode)} / {formatMoney(goalTarget, currencyCode)}
                    </span>
                    <strong>{Math.round(goalProgress)}%</strong>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="budget-category-details-recent">
              <div className="budget-category-details-section-heading">
                <strong>Recent activity</strong>
              </div>
              {activityQuery.status === "loading" ? (
                <p className="budget-category-details-empty">Loading activity…</p>
              ) : recentActivity.length > 0 ? (
                <div className="budget-category-details-recent-list">
                  {recentActivity.map((row) => (
                    <button
                      className="budget-category-details-recent-row"
                      type="button"
                      key={row.id}
                      onClick={() => onOpenActivity(category.id)}
                    >
                      <CalendarDays size={14} aria-hidden="true" />
                      <span>{formatDateForDisplay(row.date, dateFormat, "short")}</span>
                      <span className="budget-category-details-recent-payee">{row.payee}</span>
                      <strong className={row.amount < 0 ? "money-negative" : "money-positive"}>
                        {formatMoney(row.amount, currencyCode)}
                      </strong>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="budget-category-details-empty">No activity this month.</p>
              )}
              {category.activity !== 0 ? (
                <button
                  className="budget-category-details-link"
                  type="button"
                  onClick={() => onOpenActivity(category.id)}
                >
                  View all activity
                </button>
              ) : null}
            </section>

            {!isCreditCardPaymentCategory ? (
              <section className="budget-category-details-actions">
                <strong>Actions</strong>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => onOpenCoverOverspending(category.id)}
                  disabled={!canCoverOverspending}
                >
                  Cover Overspending
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled
                  title="Move Money is not yet available from Category Details."
                >
                  Move Money
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setActiveTab("goal")}
                >
                  {goal ? "Edit Goal" : "Set Goal"}
                </button>
              </section>
            ) : null}
          </>
        ) : null}

        {activeTab === "goal" ? (
          <section className="budget-category-details-tab-panel">
            <CategoryGoalInspectorSection
              budgetId={budgetId}
              category={category}
              currencyCode={currencyCode}
              managed={isCreditCardPaymentCategory}
              onAssignRecommendation={() => onAssignGoalRecommendation(category.id)}
            />
          </section>
        ) : null}

        {activeTab === "activity" ? (
          <section className="budget-category-details-tab-panel">
            <div className="budget-category-details-section-heading">
              <strong>Activity this month</strong>
              <span>{formatMoney(category.activity, currencyCode)}</span>
            </div>
            {activityQuery.status === "loading" ? (
              <p className="budget-category-details-empty">Loading activity…</p>
            ) : activityQuery.data && activityQuery.data.rows.length > 0 ? (
              <div className="budget-category-details-activity-list">
                {activityQuery.data.rows.slice(0, 8).map((row) => (
                  <button
                    className="budget-category-details-activity-row"
                    type="button"
                    key={row.id}
                    onClick={() => onOpenActivity(category.id)}
                  >
                    <span>{formatDateForDisplay(row.date, dateFormat, "short")}</span>
                    <span>{row.payee}</span>
                    <strong className={row.amount < 0 ? "money-negative" : "money-positive"}>
                      {formatMoney(row.amount, currencyCode)}
                    </strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="budget-category-details-empty">No activity this month.</p>
            )}
            {category.activity !== 0 ? (
              <button
                className="budget-category-details-link"
                type="button"
                onClick={() => onOpenActivity(category.id)}
              >
                Open full activity
              </button>
            ) : null}
          </section>
        ) : null}

        {activeTab === "notes" ? (
          <section className="budget-category-details-tab-panel budget-category-details-notes-panel">
            <div>
              <span>Category note</span>
              <p>{category.note?.trim() || "No category note."}</p>
            </div>
            <div>
              <span>Group note</span>
              <p>{group.note?.trim() || "No group note."}</p>
            </div>
            {!isCreditCardPaymentCategory ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => onOpenManageCategory(category.id)}
              >
                {hasNotes ? "Edit Notes" : "Add Notes"}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
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
      <WorkspaceLayout className="page-stack">
        <WorkspaceHeader title="Budget" subtitle="No active budget is selected." />
        <WorkspaceBody>
          <Card>Open or create a budget before editing categories.</Card>
        </WorkspaceBody>
      </WorkspaceLayout>
    );
  }

  return <BudgetWorkspacePage budgetId={activeBudgetId} />;
}

function BudgetWorkspacePage({ budgetId }: BudgetWorkspacePageProps) {
  const navigate = useNavigate();
  const [categoryWindow, setCategoryWindow] = useState<{
    categoryId: string;
    tab: BudgetCategoryWindowTab;
    position: Pick<FloatingPosition, "top" | "left">;
  } | null>(null);
  const [budgetContextMenu, setBudgetContextMenu] = useState<{
    category: BudgetCategoryView;
    group: BudgetCategoryGroupView;
    position: Pick<FloatingPosition, "top" | "left">;
  } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getCurrentBudgetMonth(),
  );
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() =>
    readCollapsedBudgetGroupIds(budgetId),
  );
  const [archivedCategoriesExpanded, setArchivedCategoriesExpanded] = useState(() =>
    readArchivedCategoriesExpanded(budgetId),
  );
  const [isOrganiserOpen, setIsOrganiserOpen] = useState(false);

  const {
    data,
    isLoading,
    error,
    selectedCategory,
    selectedGroup,
    overassignedCategoryIds,
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
    createCategory,
    activityDrilldown,
    isActivityDrilldownLoading,
    openActivityDrilldown,
    closeActivityDrilldown,
    clearSelection,
  } = useBudgetWorkspace(budgetId, selectedMonth);

  const nextMonth = getNextBudgetMonth(selectedMonth);
  const nextMonthBudget = useBudgetView(budgetId, nextMonth);
  const nextMonthOutlook = nextMonthBudget.data
    ? resolveBudgetNextMonthOutlook(nextMonthBudget.data.readyToAssign)
    : null;

  const applicationHistory = useApplicationHistory();

  function prefetchMonth(month: string) {
    void prefetchBudgetMonthQuery({ budgetId, month }).catch(() => undefined);
  }

  const budgetWorkspaceMainRef = useRef<HTMLElement | null>(null);

  const budgetTableLayout = useTableLayout({
    storageKeyPrefix: BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
    scopeId: budgetId,
    columns: BUDGET_COLUMN_DEFINITIONS,
    minimumWidthRem: 30,
  });
  const budgetGridStyle: BudgetGridStyle = {
    "--budget-grid-template-columns": budgetTableLayout.rowStyle
      .gridTemplateColumns as CSSProperties["gridTemplateColumns"],
    "--budget-grid-min-width": budgetTableLayout.rowStyle
      .minWidth as CSSProperties["minWidth"],
    "--budget-grid-width": budgetTableLayout.rowStyle.width as CSSProperties["width"],
  };

  const isBudgetColumnVisible = useMemo(
    () => (columnId: BudgetColumnId) => budgetTableLayout.visibleColumnSet.has(columnId),
    [budgetTableLayout.visibleColumnSet],
  );

  useEffect(() => {
    if (
      categoryWindow &&
      (!data?.categoryGroups.some((group) =>
        group.categories.some((category) => category.id === categoryWindow.categoryId),
      ) || isCreditCardPaymentCategory(categoryWindow.categoryId))
    ) {
      setCategoryWindow(null);
    }
  }, [categoryWindow, data]);

  useEffect(() => {
    setCollapsedGroupIds(readCollapsedBudgetGroupIds(budgetId));
    setArchivedCategoriesExpanded(readArchivedCategoriesExpanded(budgetId));
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

  const activeCategoryGroups = data
    ? getActiveCategoryGroups(data.categoryGroups)
    : [];
  const archivedCategoriesGroup = data
    ? buildArchivedCategoriesGroup(data.categoryGroups)
    : null;
  const archivedCategorySourceGroupById = data
    ? buildArchivedCategorySourceGroupMap(data.categoryGroups)
    : new Map<string, BudgetCategoryGroupView>();
  const visibleCategoryGroups = archivedCategoriesGroup
    ? [...activeCategoryGroups, archivedCategoriesGroup]
    : activeCategoryGroups;
  const categoryWindowGroup = categoryWindow
    ? visibleCategoryGroups.find((group) =>
      group.categories.some((category) => category.id === categoryWindow.categoryId),
    ) ?? null
    : null;
  const categoryWindowCategory = categoryWindowGroup?.categories.find(
    (category) => category.id === categoryWindow?.categoryId,
  ) ?? null;

  if (isLoading) {
    return (
      <WorkspaceLayout className="page-stack">
        <WorkspaceHeader title="Budget" subtitle="Loading budget workspace…" />
        <WorkspaceBody>
          <Card>Loading budget workspace.</Card>
        </WorkspaceBody>
      </WorkspaceLayout>
    );
  }

  if (error || !data) {
    return (
      <WorkspaceLayout className="page-stack">
        <WorkspaceHeader
          title="Budget"
          subtitle="Unable to load budget workspace."
        />
        <WorkspaceBody>
          <Card>{error ?? "Unknown error."}</Card>
        </WorkspaceBody>
      </WorkspaceLayout>
    );
  }

  const authoritativeSummary = readAuthoritativeBudgetSummary(data);
  if (!authoritativeSummary) {
    return (
      <WorkspaceLayout className="page-stack">
        <WorkspaceHeader
          title="Budget"
          subtitle="The authoritative budget projection is incomplete."
        />
        <WorkspaceBody>
          <Card>
            This budget month is missing engine-derived rollover fields. Refresh
            the budget to rebuild its SQLite projection.
          </Card>
        </WorkspaceBody>
      </WorkspaceLayout>
    );
  }

  const {
    visibleSelectedCategory,
    visibleSelectedGroup,
    selectedCategoryIsOverassignedSource,
  } = buildBudgetInspectorState({
    selectedCategory,
    selectedGroup,
    hideArchivedCategories: false,
    overassignedCategoryIds,
  });

  const isBudgetOverassigned = isMoneyNegative(data.readyToAssign);

  const coverOptions = buildOverspendingCoverOptions(data.categoryGroups);
  const monthName = data.monthLabel.split(" ")[0] ?? data.monthLabel;
  const selectedYear = Number(selectedMonth.slice(0, 4));
  const selectableYears = Array.from(
    { length: 41 },
    (_, index) => selectedYear - 20 + index,
  );
  const navigationMonths = getBudgetMonthWindow(selectedMonth).map(
    (value, index) => {
      const offset = index - 5;
      const year = Number(value.slice(0, 4));
      const monthIndex = Number(value.slice(5, 7)) - 1;

      return {
        label: BUDGET_MONTH_LABELS[monthIndex]!,
        value,
        year,
        offset,
        distance: Math.abs(offset),
      };
    },
  );
  const carriedForward = authoritativeSummary.carriedForwardReadyToAssign;
  const previousOverspending = authoritativeSummary.previousOverspending;
  const incomeForMonth = authoritativeSummary.incomeForMonth;

  function openCategoryWindow(
    categoryId: string,
    requestedTab?: BudgetCategoryWindowTab,
  ) {
    const category = visibleCategoryGroups
      .flatMap((group) => group.categories)
      .find((candidate) => candidate.id === categoryId);
    if (!category || isCreditCardPaymentCategory(categoryId)) {
      selectCategory(categoryId);
      return;
    }

    selectCategory(categoryId);
    setCategoryWindow({
      categoryId,
      tab: resolveBudgetCategoryWindowTab(category, requestedTab),
      position: resolveCategoryWindowPosition(),
    });
  }

  function openCategorySettings(categoryId: string) {
    openCategoryWindow(categoryId, "settings");
  }

  function closeBudgetContextMenu() {
    setBudgetContextMenu(null);
  }

  function resolveCategoryWindowPosition(): FloatingPosition {
    const viewportPadding = 12;
    const preferredWidth = 544;
    const viewportWidth = window.innerWidth;

    const workspaceRect =
      budgetWorkspaceMainRef.current?.getBoundingClientRect();

    if (!workspaceRect) {
      return {
        top: viewportPadding,
        left: Math.max(
          viewportPadding,
          (viewportWidth - preferredWidth) / 2,
        ),
        placement: "bottom-start",
      };
    }

    const usableLeft = Math.max(
      viewportPadding,
      workspaceRect.left + viewportPadding,
    );
    const usableRight = Math.min(
      viewportWidth - viewportPadding,
      workspaceRect.right - viewportPadding,
    );
    const usableWidth = Math.max(0, usableRight - usableLeft);
    const actualWidth = Math.min(preferredWidth, usableWidth);

    const budgetContentOffset = 180;

    return {
      top: Math.max(
        viewportPadding,
        workspaceRect.top + budgetContentOffset,
      ),
      left: Math.max(
        usableLeft,
        usableLeft + (usableWidth - actualWidth) / 2,
      ),
      placement: "bottom-start",
    };
  }

  function closeCategoryWindow() {
    setCategoryWindow(null);
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
    openCategoryWindow(categoryId, "cover-overspending");
  }

  function openCoverOverspendingMenuFromRow({
    category,
  }: {
    event: MouseEvent<HTMLElement>;
    category: BudgetCategoryView;
  }) {
    openCategoryWindow(category.id, "cover-overspending");
  }

  async function handleCreateCategory() {
    const group = visibleCategoryGroups.find(
      (candidate) =>
        candidate.id !== ARCHIVED_CATEGORIES_GROUP_ID &&
        !isCreditCardPaymentGroup(candidate.id),
    );
    if (!group) return;

    const name = (
      await promptDialog({
        title: "New category",
        message: `Enter a category name for ${group.name}.`,
        confirmLabel: "Create category",
        placeholder: "Category name",
      })
    )?.trim();

    if (!name) return;

    await createCategory({
      name,
      groupId: group.id,
      groupName: group.name,
    });
  }

  return (
    <>
      <WorkspaceLayout
        className={
          visibleSelectedCategory && visibleSelectedGroup
            ? "budget-workspace-screen budget-workspace-layout budget-workspace-layout-details-open"
            : "budget-workspace-screen budget-workspace-layout"
        }
      >
        <main
          className="budget-workspace-main"
          ref={budgetWorkspaceMainRef}
        >
          <WorkspaceStickyHeader className="budget-sticky-working-header">
            <section className="budget-planning-header" aria-label="Budget month workspace">
              <nav className="budget-year-month-navigation" aria-label="Budget month navigation">
                <button
                  className="budget-month-step"
                  type="button"
                  onMouseEnter={() => prefetchMonth(getPreviousBudgetMonth(selectedMonth))}
                  onFocus={() => prefetchMonth(getPreviousBudgetMonth(selectedMonth))}
                  onClick={() =>
                    setSelectedMonth((currentMonth) =>
                      getPreviousBudgetMonth(currentMonth),
                    )
                  }
                  aria-label="Go to previous budget month"
                  title="Previous month"
                >
                  ‹
                </button>
                <div className="budget-month-strip">
                  {navigationMonths.map(({ label, value, year, offset, distance }) => {
                    const isSelected = offset === 0;
                    const showWarning =
                      value === nextMonth &&
                      nextMonthOutlook?.status === "overbudget";
                    const showYear = isSelected || value.endsWith("-01");

                    return (
                      <button
                        className={
                          isSelected
                            ? "budget-month-chip budget-month-chip-active"
                            : "budget-month-chip"
                        }
                        type="button"
                        key={value}
                        data-distance={distance}
                        onMouseEnter={() => prefetchMonth(value)}
                        onFocus={() => prefetchMonth(value)}
                        onClick={() => setSelectedMonth(value)}
                        aria-current={isSelected ? "date" : undefined}
                        aria-label={`Open ${label} ${year} budget`}
                      >
                        <span className="budget-month-chip-label">{label}</span>
                        {showYear ? (
                          <span className="budget-month-chip-year">{year}</span>
                        ) : null}
                        {showWarning ? (
                          <span
                            className="budget-month-chip-status"
                            aria-label="Projected overbudget"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="budget-month-step"
                  type="button"
                  onMouseEnter={() => prefetchMonth(getNextBudgetMonth(selectedMonth))}
                  onFocus={() => prefetchMonth(getNextBudgetMonth(selectedMonth))}
                  onClick={() =>
                    setSelectedMonth((currentMonth) =>
                      getNextBudgetMonth(currentMonth),
                    )
                  }
                  aria-label="Go to next budget month"
                  title="Next month"
                >
                  ›
                </button>
              </nav>

              <div className="budget-planning-title">
                <div>
                  <div className="budget-planning-title-line">
                    <h1>{monthName}</h1>
                    <label className="budget-year-picker">
                      <span className="sr-only">Budget year</span>
                      <select
                        className="budget-year-select"
                        value={selectedYear}
                        onChange={(event) => {
                          const nextYear = event.currentTarget.value;
                          setSelectedMonth((currentMonth) =>
                            `${nextYear}-${currentMonth.slice(5, 7)}`,
                          );
                        }}
                        aria-label="Budget year"
                        title="Select budget year"
                      >
                        {selectableYears.map((year) => (
                          <option value={year} key={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <span>Monthly Budget</span>
                </div>
              </div>

              <div className="budget-planning-summary-stack">
                <div
                  className={
                    isBudgetOverassigned
                      ? "budget-ready-summary budget-ready-summary-negative"
                      : isMoneyZero(data.readyToAssign)
                        ? "budget-ready-summary budget-ready-summary-neutral"
                        : "budget-ready-summary budget-ready-summary-positive"
                  }
                  aria-label={`Ready to assign ${formatMoney(data.readyToAssign, data.currencyCode)}`}
                >
                  <div className="budget-ready-summary-primary">
                    <span className="budget-ready-summary-icon" aria-hidden="true">
                      <CircleDollarSign size={30} />
                    </span>
                    <div className="budget-ready-summary-heading">
                      <span>Ready to Assign</span>
                      <strong>{formatMoney(data.readyToAssign, data.currencyCode)}</strong>
                    </div>
                  </div>
                  <dl className="budget-ready-summary-breakdown">
                    <div>
                      <dt>Carried forward</dt>
                      <dd>{formatMoney(carriedForward, data.currencyCode)}</dd>
                    </div>
                    <div>
                      <dt>Previous overspending</dt>
                      <dd className="budget-ready-summary-negative-value">
                        {formatMoney(previousOverspending, data.currencyCode)}
                      </dd>
                    </div>
                    <div>
                      <dt>Income for {monthName}</dt>
                      <dd>{formatMoney(incomeForMonth, data.currencyCode)}</dd>
                    </div>
                    <div>
                      <dt>Assigned in {monthName}</dt>
                      <dd>{formatMoney(-data.totalAssigned, data.currencyCode)}</dd>
                    </div>
                  </dl>
                </div>

                <BudgetNextMonthOutlook
                  data={nextMonthBudget.data}
                  isLoading={nextMonthBudget.isLoading}
                  error={nextMonthBudget.error}
                  currencyCode={data.currencyCode}
                  onOpen={() => setSelectedMonth(nextMonth)}
                />
              </div>

              <nav className="budget-planning-tabs" aria-label="Budget workspace views">
                <button className="budget-planning-tab budget-planning-tab-active" type="button">
                  Budget
                </button>
                <button
                  className="budget-planning-tab"
                  type="button"
                  disabled
                  title="Goals workspace is planned for a future update"
                >
                  Goals
                </button>
              </nav>

              <div className="budget-planning-toolbar">
                <div className="budget-planning-toolbar-left">
                  <button className="button button-secondary" type="button" onClick={() => setIsOrganiserOpen(true)}>
                    <ListTree size={17} aria-hidden="true" />
                    Organise Categories
                  </button>
                  <button className="button button-secondary" type="button" disabled title="Auto Assign is not yet available">
                    Auto Assign
                  </button>
                  <button
                    className="button button-secondary budget-history-icon-button"
                    type="button"
                    onClick={() => void applicationHistory.undo()}
                    disabled={!applicationHistory.canUndo}
                    aria-label="Undo"
                    title="Undo"
                  >
                    <Undo2 size={18} aria-hidden="true" />
                  </button>
                  <button
                    className="button button-secondary budget-history-icon-button"
                    type="button"
                    onClick={() => void applicationHistory.redo()}
                    disabled={!applicationHistory.canRedo}
                    aria-label="Redo"
                    title="Redo"
                  >
                    <Redo2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>

            <div
              className="budget-workspace-table-head"
              style={budgetGridStyle}
            >
              {budgetTableLayout.visibleColumns.map((column) => (
                <span
                  className={`table-layout-resizable-head-cell budget-column-${column.id}`}
                  key={column.id}
                >
                  {column.id === "category" ? (
                    <span className="budget-category-header-label">
                      <span>{column.label}</span>
                      <button
                        className="budget-category-add-button"
                        type="button"
                        onClick={() => void handleCreateCategory()}
                        aria-label="Add category"
                        title="Add category"
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    column.label
                  )}
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
          </WorkspaceStickyHeader>

          <Card className="budget-workspace-table-card">
            <BudgetVirtualizedGroupList
              groups={visibleCategoryGroups}
              isGroupCollapsed={(group) =>
                group.id === ARCHIVED_CATEGORIES_GROUP_ID
                  ? !archivedCategoriesExpanded
                  : collapsedGroupIds.has(group.id)
              }
              pinnedGroupIds={new Set([
                ...(visibleSelectedGroup ? [visibleSelectedGroup.id] : []),
                ...(categoryWindowGroup ? [categoryWindowGroup.id] : []),
              ])}
              renderGroup={(group) => (
                <BudgetGroup
                  group={group}
                  currencyCode={data.currencyCode}
                  selectedCategoryId={visibleSelectedCategory?.id ?? null}
                  overassignedCategoryIds={overassignedCategoryIds}
                  onSelectCategory={selectCategory}
                  onOpenCategoryContextMenu={openBudgetContextMenu}
                  onOpenCoverOverspending={openCoverOverspendingMenuFromRow}
                  onAssignedChange={updateAssigned}
                  onActivityClick={openActivityDrilldown}
                  isBudgetColumnVisible={isBudgetColumnVisible}
                  gridStyle={budgetGridStyle}
                  isCreditCardPaymentGroup={isCreditCardPaymentGroup(group.id)}
                  isArchivedCategoriesGroup={group.id === ARCHIVED_CATEGORIES_GROUP_ID}
                  originalGroupByCategoryId={archivedCategorySourceGroupById}
                  isCollapsed={
                    group.id === ARCHIVED_CATEGORIES_GROUP_ID
                      ? !archivedCategoriesExpanded
                      : collapsedGroupIds.has(group.id)
                  }
                  onToggleCollapsed={() => {
                    if (group.id === ARCHIVED_CATEGORIES_GROUP_ID) {
                      setArchivedCategoriesExpanded((current) => {
                        const next = !current;
                        writeArchivedCategoriesExpanded(budgetId, next);
                        return next;
                      });
                      return;
                    }
                    toggleBudgetGroup(group.id);
                  }}
                />
              )}
            />
          </Card>
        </main>

        {visibleSelectedCategory && visibleSelectedGroup ? (
          <CategoryDetailsPanel
            budgetId={budgetId}
            month={selectedMonth}
            category={visibleSelectedCategory}
            group={visibleSelectedGroup}
            currencyCode={data.currencyCode}
            isOverassignedSource={selectedCategoryIsOverassignedSource}
            isCreditCardPaymentCategory={isCreditCardPaymentCategory(visibleSelectedCategory.id)}
            onAssignGoalRecommendation={assignGoalRecommendation}
            onOpenActivity={openActivityDrilldown}
            onOpenManageCategory={openCategorySettings}
            onOpenCoverOverspending={openCoverOverspendingMenu}
            onClose={clearSelection}
          />
        ) : null}
      </WorkspaceLayout>

      {isOrganiserOpen ? (
        <OrganiseCategoriesDialog
          groups={data.categoryGroups}
          onClose={() => setIsOrganiserOpen(false)}
          onMoveCategory={moveCategory}
          onPositionCategory={moveCategoryToPosition}
          onMoveGroup={moveCategoryGroup}
          onPositionGroup={moveCategoryGroupToPosition}
        />
      ) : null}

      <BudgetCategoryContextMenu
        isOpen={Boolean(budgetContextMenu)}
        position={budgetContextMenu?.position ?? null}
        category={budgetContextMenu?.category ?? null}
        group={budgetContextMenu?.group ?? null}
        hasActivity={(budgetContextMenu?.category.activity ?? 0) !== 0}
        onClose={closeBudgetContextMenu}
        onOpenActivity={openActivityDrilldown}
        onOpenCoverOverspending={openCoverOverspendingMenu}
        onOpenCategorySettings={openCategorySettings}
        onSetCategoryArchived={setCategoryArchived}
      />
      <BudgetCategoryWindow
        isOpen={Boolean(categoryWindow)}
        position={categoryWindow?.position ?? null}
        category={categoryWindowCategory}
        group={categoryWindowGroup}
        activeTab={categoryWindow?.tab ?? "settings"}
        coverOptions={coverOptions}
        currencyCode={data.currencyCode}
        onClose={closeCategoryWindow}
        onTabChange={(tab) => {
          setCategoryWindow((current) => current ? { ...current, tab } : null);
        }}
        onRenameCategory={renameCategory}
        onSetCategoryArchived={setCategoryArchived}
        onUpdateCategoryNote={updateCategoryNote}
        onSetOverspendingHandling={setCategoryOverspendingHandling}
        onCoverOverspending={(input) => {
          closeCategoryWindow();
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
    </>
  );
}
