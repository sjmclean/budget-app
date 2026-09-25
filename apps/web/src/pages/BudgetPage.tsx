import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
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
import {
  prefetchBudgetMonthQuery,
  useBudgetPlanningSummaryQuery,
  useCategoryActivityDrilldownQuery,
} from "../features/persistence/reactiveQueries";
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
import { BudgetMoveMoneyDialog } from "../features/budget/BudgetMoveMoneyDialog";
import { BudgetVirtualizedGroupList } from "../features/budget/BudgetVirtualizedGroupList";
import { useBudgetMoneyMovementHistory } from "../features/budget/useBudgetMoneyMovementHistory";
import type { BudgetMoneyMovementHistoryEntry } from "../features/budget/budgetMoneyMovement";
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

const BUDGET_VISIBLE_MONTHS_STORAGE_KEY_PREFIX =
  "budget-app.budget-visible-months.v1";

function readPreferredVisibleBudgetMonths(budgetId: string): number {
  if (typeof window === "undefined") return 1;
  const value = Number(
    window.localStorage.getItem(
      `${BUDGET_VISIBLE_MONTHS_STORAGE_KEY_PREFIX}.${budgetId}`,
    ),
  );
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 1;
}

function writePreferredVisibleBudgetMonths(budgetId: string, count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${BUDGET_VISIBLE_MONTHS_STORAGE_KEY_PREFIX}.${budgetId}`,
    String(Math.max(1, Math.min(4, Math.round(count)))),
  );
}

function visibleBudgetMonthCapacity(workspaceWidth: number): number {
  if (workspaceWidth >= 1960) return 4;
  if (workspaceWidth >= 1470) return 3;
  if (workspaceWidth >= 975) return 2;
  return 1;
}

function buildVisibleBudgetMonths(startMonth: string, count: number): string[] {
  const months = [startMonth];
  while (months.length < count) {
    months.push(getNextBudgetMonth(months[months.length - 1]!));
  }
  return months;
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

function formatBudgetMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year!, monthNumber! - 1, 1));
}

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
  const statusClass = outlook?.status === "overbudget"
    ? "budget-next-month-outlook-overbudget"
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

function BudgetHealthCard({
  monthLabel,
  currencyCode,
  overspentCategoryCount,
  overspentAmount,
  nextMonthLabel,
  nextMonthStatus,
  nextMonthAmount,
  futureOvercommitment,
}: {
  monthLabel: string;
  currencyCode: string;
  overspentCategoryCount: number;
  overspentAmount: number;
  nextMonthLabel: string;
  nextMonthStatus: "overbudget" | "balanced" | "available" | "loading" | "unavailable";
  nextMonthAmount: number;
  futureOvercommitment: number;
}) {
  return (
    <section className="budget-health-card" aria-label={`Budget health for ${monthLabel}`}>
      <header className="budget-health-card-header">
        <div>
          <span>Budget Health</span>
          <strong>{monthLabel}</strong>
        </div>
      </header>

      <div className="budget-health-list">
        <div className={overspentCategoryCount > 0 ? "budget-health-row budget-health-row-warning" : "budget-health-row"}>
          <span>Overspent categories</span>
          <strong>
            {overspentCategoryCount > 0
              ? `${overspentCategoryCount} · ${formatMoney(overspentAmount, currencyCode)}`
              : "None"}
          </strong>
        </div>

        <div className={nextMonthStatus === "overbudget" ? "budget-health-row budget-health-row-warning" : "budget-health-row"}>
          <span>{nextMonthLabel}</span>
          <strong>
            {nextMonthStatus === "loading"
              ? "Checking…"
              : nextMonthStatus === "unavailable"
                ? "Unavailable"
                : nextMonthStatus === "overbudget"
                  ? `${formatMoney(nextMonthAmount, currencyCode)} overbudget`
                  : nextMonthStatus === "balanced"
                    ? "Balanced"
                    : "Not overbudget"}
          </strong>
        </div>

        <div className={futureOvercommitment > 0 ? "budget-health-row budget-health-row-warning" : "budget-health-row"}>
          <span>Future funding</span>
          <strong>
            {futureOvercommitment > 0
              ? `${formatMoney(futureOvercommitment, currencyCode)} overcommitted`
              : "No overcommitment"}
          </strong>
        </div>
      </div>
    </section>
  );
}

function BudgetCategoryDetailsEmptyState() {
  return (
    <aside
      className="budget-category-details-panel budget-category-details-panel-empty"
      aria-label="Category details"
    >
      <header className="budget-category-details-header">
        <h2>Category Details</h2>
      </header>
      <div className="budget-category-details-empty-state">
        <strong>Select a category</strong>
        <p>
          Category details, activity, goals, notes and money-movement actions
          will appear here.
        </p>
      </div>
    </aside>
  );
}

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
  onOpenMoveMoney,
  movementHistory,
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
  onOpenMoveMoney: (categoryId: string) => void;
  movementHistory: readonly BudgetMoneyMovementHistoryEntry[];
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
  const recentMovements = movementHistory.slice(-5).reverse();

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

            <section className="budget-category-details-movements">
              <div className="budget-category-details-section-heading">
                <strong>Money movements</strong>
              </div>
              {recentMovements.length > 0 ? (
                <div className="budget-category-details-movement-list">
                  {recentMovements.map((entry) => (
                    <div className="budget-category-details-movement-row" key={entry.id}>
                      <span>
                        {formatDateForDisplay(entry.occurredAt, dateFormat, "short")}
                      </span>
                      <span className="budget-category-details-movement-route">
                        {entry.payload.sources
                          .map((source) => source.categoryName)
                          .join(" + ")}
                        {" → "}
                        {entry.payload.destinationCategoryName}
                      </span>
                      <strong>
                        {formatMoney(entry.payload.amount, entry.payload.currencyCode)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="budget-category-details-empty">
                  No effective money movements this month.
                </p>
              )}
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
                  onClick={() => onOpenMoveMoney(category.id)}
                  disabled={category.isArchived}
                  title={category.isArchived ? "Restore this category before moving money." : undefined}
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

function BudgetVisibleMonthToggle({
  visibleCount,
  capacity,
  onChange,
}: {
  visibleCount: number;
  capacity: number;
  onChange: (count: number) => void;
}) {
  return (
    <label className="budget-visible-month-control">
      <span>Months</span>
      <select
        className="budget-visible-month-select"
        value={visibleCount}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Visible budget months"
      >
        {[1, 2, 3, 4].map((count) => (
          <option key={count} value={count} disabled={count > capacity}>
            {count}
          </option>
        ))}
      </select>
    </label>
  );
}

function BudgetMultiMonthPane({
  month,
  data,
  selectedCategoryId,
  onSelectCategory,
  updateAssigned,
  overassignedCategoryIds,
  collapsedGroupIds,
  archivedCategoriesExpanded,
  onToggleGroup,
  onToggleArchived,
  toolbar,
}: {
  month: string;
  data: BudgetMonthView;
  selectedCategoryId: string | null;
  onSelectCategory: (month: string, categoryId: string) => void;
  updateAssigned: (categoryId: string, value: number) => void;
  overassignedCategoryIds: string[];
  collapsedGroupIds: ReadonlySet<string>;
  archivedCategoriesExpanded: boolean;
  onToggleGroup: (groupId: string) => void;
  onToggleArchived: () => void;
  toolbar?: ReactNode;
}) {
  const summary = readAuthoritativeBudgetSummary(data);
  const planningReadyToAssign =
    data.planningReadyToAssign ?? data.readyToAssign;
  const monthName = data.monthLabel.split(" ")[0] ?? data.monthLabel;
  const activeGroups = getActiveCategoryGroups(data.categoryGroups);
  const archivedGroup = buildArchivedCategoriesGroup(data.categoryGroups);
  const groups = archivedGroup ? [...activeGroups, archivedGroup] : activeGroups;
  const originalGroupByCategoryId =
    buildArchivedCategorySourceGroupMap(data.categoryGroups);
  const gridStyle: BudgetGridStyle = {
    "--budget-grid-template-columns":
      "minmax(11rem, 1fr) minmax(5.5rem, 6.25rem) minmax(5.5rem, 6.25rem) minmax(5.5rem, 6.25rem)",
    "--budget-grid-min-width": "29rem",
    "--budget-grid-width": "100%",
  };

  return (
    <section className="budget-multi-month-pane" aria-label={`${data.monthLabel} budget`}>
      <header className="budget-multi-month-pane-header">
        <div>
          <h2>{data.monthLabel}</h2>
          <span>Monthly Budget</span>
        </div>
      </header>

      <div
        className={
          isMoneyNegative(planningReadyToAssign)
            ? "budget-ready-summary budget-ready-summary-negative"
            : isMoneyZero(planningReadyToAssign)
              ? "budget-ready-summary budget-ready-summary-neutral"
              : "budget-ready-summary budget-ready-summary-positive"
        }
      >
        <div className="budget-ready-summary-primary">
          <span className="budget-ready-summary-icon" aria-hidden="true">
            <CircleDollarSign size={26} />
          </span>
          <div className="budget-ready-summary-heading">
            <span>Ready to Assign</span>
            <strong>{formatMoney(planningReadyToAssign, data.currencyCode)}</strong>
          </div>
        </div>
        {summary ? (
          <dl className="budget-ready-summary-breakdown">
            <div>
              <dt>Carried forward</dt>
              <dd>{formatMoney(summary.carriedForwardReadyToAssign, data.currencyCode)}</dd>
            </div>
            <div>
              <dt>Previous overspending</dt>
              <dd>{formatMoney(summary.previousOverspending, data.currencyCode)}</dd>
            </div>
            <div>
              <dt>Income for {monthName}</dt>
              <dd>{formatMoney(summary.incomeForMonth, data.currencyCode)}</dd>
            </div>
            <div>
              <dt>Assigned in {monthName}</dt>
              <dd>{formatMoney(-data.totalAssigned, data.currencyCode)}</dd>
            </div>
          </dl>
        ) : (
          <p className="budget-multi-month-summary-unavailable">
            Budget breakdown unavailable for this month.
          </p>
        )}
      </div>

      <div className="budget-multi-month-toolbar-slot">
        {toolbar ?? null}
      </div>

      <div className="budget-workspace-table-head" style={gridStyle}>
        {BUDGET_COLUMN_DEFINITIONS.map((column) => (
          <span className={`budget-column-${column.id}`} key={column.id}>
            {column.label}
          </span>
        ))}
      </div>

      <Card className="budget-workspace-table-card">
        <BudgetVirtualizedGroupList
          groups={groups}
          isGroupCollapsed={(group) =>
            group.id === ARCHIVED_CATEGORIES_GROUP_ID
              ? !archivedCategoriesExpanded
              : collapsedGroupIds.has(group.id)
          }
          pinnedGroupIds={new Set()}
          renderGroup={(group) => (
            <BudgetGroup
              group={group}
              currencyCode={data.currencyCode}
              selectedCategoryId={selectedCategoryId}
              overassignedCategoryIds={overassignedCategoryIds}
              onSelectCategory={(categoryId) => onSelectCategory(month, categoryId)}
              onAssignedChange={updateAssigned}
              onActivityClick={() => undefined}
              isBudgetColumnVisible={() => true}
              gridStyle={gridStyle}
              isCreditCardPaymentGroup={isCreditCardPaymentGroup(group.id)}
              isArchivedCategoriesGroup={group.id === ARCHIVED_CATEGORIES_GROUP_ID}
              originalGroupByCategoryId={originalGroupByCategoryId}
              isCollapsed={
                group.id === ARCHIVED_CATEGORIES_GROUP_ID
                  ? !archivedCategoriesExpanded
                  : collapsedGroupIds.has(group.id)
              }
              onToggleCollapsed={() => {
                if (group.id === ARCHIVED_CATEGORIES_GROUP_ID) {
                  onToggleArchived();
                  return;
                }
                onToggleGroup(group.id);
              }}
            />
          )}
        />
      </Card>
    </section>
  );
}

function BudgetFutureMonthPane({
  budgetId,
  month,
  selectedCategoryId,
  onSelectCategory,
  collapsedGroupIds,
  archivedCategoriesExpanded,
  onToggleGroup,
  onToggleArchived,
}: {
  budgetId: string;
  month: string;
  selectedCategoryId: string | null;
  onSelectCategory: (month: string, categoryId: string) => void;
  collapsedGroupIds: ReadonlySet<string>;
  archivedCategoriesExpanded: boolean;
  onToggleGroup: (groupId: string) => void;
  onToggleArchived: () => void;
}) {
  const workspace = useBudgetWorkspace(budgetId, month);

  if (!workspace.data) {
    return (
      <section className="budget-multi-month-pane budget-multi-month-pane-loading">
        <h2>{formatBudgetMonthLabel(month)}</h2>
        <Card>{workspace.isLoading ? "Loading month…" : (workspace.error ?? "Month unavailable.")}</Card>
      </section>
    );
  }

  return (
    <BudgetMultiMonthPane
      month={month}
      data={workspace.data}
      selectedCategoryId={selectedCategoryId}
      onSelectCategory={onSelectCategory}
      updateAssigned={workspace.updateAssigned}
      overassignedCategoryIds={workspace.overassignedCategoryIds}
      collapsedGroupIds={collapsedGroupIds}
      archivedCategoriesExpanded={archivedCategoriesExpanded}
      onToggleGroup={onToggleGroup}
      onToggleArchived={onToggleArchived}
    />
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
  const [moveMoneyDestinationCategoryId, setMoveMoneyDestinationCategoryId] =
    useState<string | null>(null);
  const [futureCommitmentsExpanded, setFutureCommitmentsExpanded] =
    useState(false);
  const [preferredVisibleMonths, setPreferredVisibleMonths] = useState(() =>
    readPreferredVisibleBudgetMonths(budgetId),
  );
  const [visibleMonthCapacity, setVisibleMonthCapacity] = useState(1);
  const [inspectorCategoryOffset, setInspectorCategoryOffset] = useState(0);

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
    moveMoney,
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

  const planningSummaryQuery = useBudgetPlanningSummaryQuery({
    budgetId,
    month: selectedMonth,
  });
  const nextMonth = getNextBudgetMonth(selectedMonth);
  const nextMonthBudget = useBudgetView(budgetId, nextMonth);
  const nextMonthOutlook = nextMonthBudget.data
    ? resolveBudgetNextMonthOutlook(nextMonthBudget.data.readyToAssign)
    : null;

  const overspentCategories = data
    ? data.categoryGroups
        .flatMap((group) => group.categories)
        .filter(
          (category) =>
            !category.isArchived &&
            !isCreditCardPaymentCategory(category.id) &&
            category.isOverspent &&
            isMoneyNegative(category.available),
        )
    : [];
  const overspentAmount = overspentCategories.reduce(
    (total, category) => total + Math.abs(category.available),
    0,
  );

  const applicationHistory = useApplicationHistory();
  const moneyMovementHistory = useBudgetMoneyMovementHistory(
    budgetId,
    data?.currencyCode,
  );

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
    setPreferredVisibleMonths(readPreferredVisibleBudgetMonths(budgetId));
  }, [budgetId]);

  useEffect(() => {
    const workspace = budgetWorkspaceMainRef.current;
    const layout = workspace?.parentElement;
    if (!workspace || !layout) return;

    const updateCapacity = () => {
      const layoutWidth = layout.getBoundingClientRect().width;
      const inspector = layout.querySelector<HTMLElement>(
        ".budget-category-details-panel",
      );
      const inspectorWidth = inspector?.getBoundingClientRect().width ?? 0;
      const columnGap = Number.parseFloat(getComputedStyle(layout).columnGap) || 0;
      const availableWorkspaceWidth = Math.max(
        0,
        layoutWidth - inspectorWidth - (inspectorWidth > 0 ? columnGap : 0),
      );

      setVisibleMonthCapacity(
        visibleBudgetMonthCapacity(availableWorkspaceWidth),
      );
    };

    updateCapacity();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateCapacity);
      return () => window.removeEventListener("resize", updateCapacity);
    }

    const observer = new ResizeObserver(updateCapacity);
    observer.observe(layout);
    const inspector = layout.querySelector<HTMLElement>(
      ".budget-category-details-panel",
    );
    if (inspector) observer.observe(inspector);
    return () => observer.disconnect();
  }, []);

  const visibleMonthCount = Math.min(
    preferredVisibleMonths,
    visibleMonthCapacity,
  );

  useEffect(() => {
    const workspace = budgetWorkspaceMainRef.current;
    const layout = workspace?.parentElement;
    if (!workspace || !layout) return;

    const updateInspectorAlignment = () => {
      const layoutTop = layout.getBoundingClientRect().top;
      const tableHead = workspace.querySelector<HTMLElement>(
        ".budget-multi-month-pane > .budget-workspace-table-head, :scope > .budget-workspace-table-head",
      );
      if (!tableHead) return;

      setInspectorCategoryOffset(
        Math.max(0, tableHead.getBoundingClientRect().top - layoutTop),
      );
    };

    updateInspectorAlignment();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateInspectorAlignment);
      return () => window.removeEventListener("resize", updateInspectorAlignment);
    }

    const observer = new ResizeObserver(updateInspectorAlignment);
    observer.observe(workspace);
    observer.observe(layout);
    return () => observer.disconnect();
  }, [visibleMonthCount, selectedMonth]);
  const visibleMonths = buildVisibleBudgetMonths(
    selectedMonth,
    visibleMonthCount,
  );
  const isMultiMonthView = visibleMonthCount > 1;

  function changeVisibleMonthCount(count: number) {
    setPreferredVisibleMonths(count);
    writePreferredVisibleBudgetMonths(budgetId, count);
  }

  function selectVisibleMonthCategory(month: string, categoryId: string) {
    selectCategory(categoryId);
    if (month !== selectedMonth) {
      setSelectedMonth(month);
    }
  }

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

  const planningSummary = planningSummaryQuery.data ?? data;
  const displayedReadyToAssign =
    planningSummary.planningReadyToAssign ?? data.readyToAssign;
  const futureAssigned = planningSummary.futureAssigned ?? 0;
  const futureOvercommitment = planningSummary.futureOvercommitment ?? 0;
  const futureCommitments = planningSummary.futureCommitments ?? [];
  const isBudgetOverassigned = isMoneyNegative(displayedReadyToAssign);

  const coverOptions = buildOverspendingCoverOptions(data.categoryGroups);
  const monthName = data.monthLabel.split(" ")[0] ?? data.monthLabel;
  const selectedYear = Number(selectedMonth.slice(0, 4));
  const firstSelectableYear = Math.min(1900, selectedYear);
  const lastSelectableYear = Math.max(2100, selectedYear);
  const selectableYears = Array.from(
    { length: lastSelectableYear - firstSelectableYear + 1 },
    (_, index) => firstSelectableYear + index,
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
  const selectedCategoryMovementHistory = visibleSelectedCategory
    ? moneyMovementHistory.filter(
        (entry) =>
          entry.payload.month === selectedMonth &&
          (
            entry.payload.destinationCategoryId === visibleSelectedCategory.id ||
            entry.payload.sources.some(
              (source) => source.categoryId === visibleSelectedCategory.id,
            )
          ),
      )
    : [];

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
        className={[
          "budget-workspace-screen",
          "budget-workspace-layout",
          isMultiMonthView ? "budget-workspace-screen-multi-month" : "",
          "budget-workspace-layout-details-open",
        ].filter(Boolean).join(" ")}
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
                <label className="budget-year-picker">
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
                <div className="budget-month-strip">
                  {navigationMonths.map(({ label, value, year, offset, distance }) => {
                    const isSelected = offset === 0;
                    const showWarning =
                      value === nextMonth &&
                      nextMonthOutlook?.status === "overbudget";
                    const showYear = value.endsWith("-01") && year !== selectedYear;

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
                  <h1>
                    {isMultiMonthView
                      ? `${data.monthLabel} – ${formatBudgetMonthLabel(visibleMonths[visibleMonths.length - 1]!)}`
                      : data.monthLabel}
                  </h1>
                  <span>
                    {isMultiMonthView
                      ? `${visibleMonthCount}-month planning view`
                      : "Monthly Budget"}
                  </span>
                </div>
                {visibleMonthCapacity > 1 ? (
                  <BudgetVisibleMonthToggle
                    visibleCount={visibleMonthCount}
                    capacity={visibleMonthCapacity}
                    onChange={changeVisibleMonthCount}
                  />
                ) : null}
              </div>

              {!isMultiMonthView ? (
                <>
              <div className="budget-planning-summary-stack">
                <div
                  className={
                    isBudgetOverassigned
                      ? "budget-ready-summary budget-ready-summary-negative"
                      : isMoneyZero(displayedReadyToAssign)
                        ? "budget-ready-summary budget-ready-summary-neutral"
                        : "budget-ready-summary budget-ready-summary-positive"
                  }
                  aria-label={`Ready to assign ${formatMoney(displayedReadyToAssign, data.currencyCode)}`}
                >
                  <div className="budget-ready-summary-primary">
                    <span className="budget-ready-summary-icon" aria-hidden="true">
                      <CircleDollarSign size={30} />
                    </span>
                    <div className="budget-ready-summary-heading">
                      <span>Ready to Assign</span>
                      <strong>{formatMoney(displayedReadyToAssign, data.currencyCode)}</strong>
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
                    {futureAssigned > 0 ? (
                      <div>
                        <dt>Assigned in future months</dt>
                        <dd>{formatMoney(-futureAssigned, data.currencyCode)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <BudgetNextMonthOutlook
                  data={nextMonthBudget.data}
                  isLoading={nextMonthBudget.isLoading}
                  error={nextMonthBudget.error}
                  currencyCode={data.currencyCode}
                  onOpen={() => setSelectedMonth(nextMonth)}
                />

                {futureOvercommitment > 0 ? (
                  <section
                    className="budget-future-commitment-warning"
                    aria-label="Future assignments warning"
                  >
                    <div className="budget-future-commitment-warning-main">
                      <span className="budget-future-commitment-warning-icon" aria-hidden="true">
                        <CircleAlert size={20} />
                      </span>
                      <div>
                        <strong>
                          Future assignments exceed available funds by{" "}
                          {formatMoney(futureOvercommitment, data.currencyCode)}
                        </strong>
                        <p>
                          You have assigned more in future months than is currently
                          available in {monthName}.
                        </p>
                      </div>
                      <button
                        className="budget-future-commitment-details-toggle"
                        type="button"
                        onClick={() => setFutureCommitmentsExpanded((current) => !current)}
                        aria-expanded={futureCommitmentsExpanded}
                      >
                        {futureCommitmentsExpanded ? "Hide details" : "View details"}
                      </button>
                    </div>

                    {futureCommitmentsExpanded ? (
                      <div className="budget-future-commitment-details">
                        <div className="budget-future-commitment-detail-row">
                          <span>Available before future assignments</span>
                          <strong>{formatMoney(Math.max(0, data.readyToAssign), data.currencyCode)}</strong>
                        </div>
                        {futureCommitments.flatMap((commitment) => {
                          const rows = [
                            <div
                              className="budget-future-commitment-detail-row"
                              key={`${commitment.month}-assigned`}
                            >
                              <span>Assigned in {formatBudgetMonthLabel(commitment.month)}</span>
                              <strong>{formatMoney(commitment.assigned, data.currencyCode)}</strong>
                            </div>,
                          ];
                          if ((commitment.income ?? 0) !== 0) {
                            rows.push(
                              <div
                                className="budget-future-commitment-detail-row"
                                key={`${commitment.month}-income`}
                              >
                                <span>Income in {formatBudgetMonthLabel(commitment.month)}</span>
                                <strong>{formatMoney(commitment.income ?? 0, data.currencyCode)}</strong>
                              </div>,
                            );
                          }
                          return rows;
                        })}
                        <div className="budget-future-commitment-detail-row budget-future-commitment-detail-total">
                          <span>Overcommitted</span>
                          <strong>{formatMoney(futureOvercommitment, data.currencyCode)}</strong>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
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
                </>
              ) : null}
            </section>

            {!isMultiMonthView ? (
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
            ) : null}
          </WorkspaceStickyHeader>

          {isMultiMonthView ? (
            <div
              className="budget-multi-month-grid"
              style={{ "--budget-visible-month-count": visibleMonthCount } as CSSProperties}
            >
              <BudgetMultiMonthPane
                month={selectedMonth}
                data={data}
                selectedCategoryId={visibleSelectedCategory?.id ?? null}
                onSelectCategory={selectVisibleMonthCategory}
                updateAssigned={updateAssigned}
                overassignedCategoryIds={overassignedCategoryIds}
                collapsedGroupIds={collapsedGroupIds}
                archivedCategoriesExpanded={archivedCategoriesExpanded}
                onToggleGroup={toggleBudgetGroup}
                onToggleArchived={() => {
                  setArchivedCategoriesExpanded((current) => {
                    const next = !current;
                    writeArchivedCategoriesExpanded(budgetId, next);
                    return next;
                  });
                }}
                toolbar={
                  <div
                    className="budget-multi-month-toolbar"
                    style={{
                      width: `calc(${visibleMonthCount * 100}% + ${(visibleMonthCount - 1) * 0.8}rem)`,
                    }}
                  >
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
                }
              />
              {visibleMonths.slice(1).map((month) => (
                <BudgetFutureMonthPane
                  key={month}
                  budgetId={budgetId}
                  month={month}
                  selectedCategoryId={null}
                  onSelectCategory={selectVisibleMonthCategory}
                  collapsedGroupIds={collapsedGroupIds}
                  archivedCategoriesExpanded={archivedCategoriesExpanded}
                  onToggleGroup={toggleBudgetGroup}
                  onToggleArchived={() => {
                    setArchivedCategoriesExpanded((current) => {
                      const next = !current;
                      writeArchivedCategoriesExpanded(budgetId, next);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          ) : (
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
          )}
        </main>

        <aside className="budget-inspector-column" aria-label="Budget inspector">
          <BudgetHealthCard
            monthLabel={data.monthLabel}
            currencyCode={data.currencyCode}
            overspentCategoryCount={overspentCategories.length}
            overspentAmount={overspentAmount}
            nextMonthLabel={nextMonthBudget.data?.monthLabel ?? formatBudgetMonthLabel(nextMonth)}
            nextMonthStatus={
              nextMonthBudget.isLoading
                ? "loading"
                : nextMonthBudget.error
                  ? "unavailable"
                  : (nextMonthOutlook?.status ?? "unavailable")
            }
            nextMonthAmount={nextMonthOutlook?.amount ?? 0}
            futureOvercommitment={futureOvercommitment}
          />
          <div
            className="budget-inspector-category-slot"
            style={{ "--budget-inspector-category-offset": `${inspectorCategoryOffset}px` } as CSSProperties}
          >
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
                onOpenMoveMoney={setMoveMoneyDestinationCategoryId}
                movementHistory={selectedCategoryMovementHistory}
                onClose={clearSelection}
              />
            ) : (
              <BudgetCategoryDetailsEmptyState />
            )}
          </div>
        </aside>
      </WorkspaceLayout>

      {moveMoneyDestinationCategoryId ? (
        <BudgetMoveMoneyDialog
          groups={data.categoryGroups}
          initialDestinationCategoryId={moveMoneyDestinationCategoryId}
          currencyCode={data.currencyCode}
          onClose={() => setMoveMoneyDestinationCategoryId(null)}
          onMoveMoney={(input) => {
            setMoveMoneyDestinationCategoryId(null);
            moveMoney(input);
          }}
        />
      ) : null}

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
