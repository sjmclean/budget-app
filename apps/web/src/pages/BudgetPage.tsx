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
import { ListTree, Plus, Redo2, Undo2 } from "lucide-react";
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
  addMonthsToBudgetMonth,
  getCurrentBudgetMonth,
  getNextBudgetMonth,
  getPreviousBudgetMonth,
} from "../features/budget/budgetMonthNavigation";
import { useBudgetWorkspace } from "../features/budget/useBudgetWorkspace";
import { useBudgetView } from "../features/budget/useBudgetView";
import { useApplicationHistory } from "../features/history";
import { prefetchBudgetMonthQuery } from "../features/persistence/reactiveQueries";
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
import { CategoryGoalInspectorSection } from "../features/goals/CategoryGoalInspectorSection";
import { OrganiseCategoriesDialog } from "../features/budget/OrganiseCategoriesDialog";
import { BudgetVirtualizedGroupList } from "../features/budget/BudgetVirtualizedGroupList";
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
  { id: "category", label: "Category", template: "minmax(15rem, 1fr)", widthRem: 15 },
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
      secondary = `${formatMoney(0, currencyCode)} projected`;
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

  return (
    <button
      className={`budget-next-month-outlook ${statusClass}`}
      type="button"
      onClick={onOpen}
      aria-label={`Open ${data?.monthLabel ?? "next month"} budget. ${primary}.`}
    >
      <span className="budget-next-month-outlook-kicker">Next month</span>
      <span className="budget-next-month-outlook-label">{monthName} outlook</span>
      <strong>{primary}</strong>
      <span className="budget-next-month-outlook-support">{secondary}</span>
      <span className="budget-next-month-outlook-arrow" aria-hidden="true">›</span>
    </button>
  );
}

function CategoryDetailsPanel({
  budgetId,
  category,
  group,
  currencyCode,
  isOverassignedSource,
  isCreditCardPaymentCategory,
  onAssignGoalRecommendation,
  onOpenActivity,
  onOpenSettings,
  onClose,
}: {
  budgetId: string;
  category: BudgetCategoryView;
  group: BudgetCategoryGroupView;
  currencyCode: string;
  isOverassignedSource: boolean;
  isCreditCardPaymentCategory: boolean;
  onAssignGoalRecommendation: ReturnType<typeof useBudgetWorkspace>["assignGoalRecommendation"];
  onOpenActivity: (categoryId: string) => void;
  onOpenSettings: (categoryId: string) => void;
  onClose: () => void;
}) {
  const statusLabel = isMoneyNegative(category.available)
    ? "Overspent"
    : isOverassignedSource
      ? "Overbudgeted"
      : "Available";
  const categoryNote = category.note?.trim() ?? "";
  const groupNote = group.note?.trim() ?? "";

  return (
    <aside
      className="budget-category-details-panel"
      aria-label={`Category details for ${category.name}`}
    >
      <header className="budget-category-details-header">
        <div className="budget-category-details-identity">
          <span className="budget-category-details-kicker">Category Details</span>
          <h2>{category.name}</h2>
          <p>
            {group.name}
            {category.isArchived ? " · Archived" : ""}
            {isCreditCardPaymentCategory ? " · Managed" : ""}
          </p>
        </div>
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

      <div className="budget-category-details-content">
        <section className="budget-category-details-balance" aria-label="Category balance">
          <div>
            <span>Available</span>
            <strong className={getAvailableClass(category.available, isOverassignedSource)}>
              {formatMoney(category.available, currencyCode)}
            </strong>
          </div>
          <span className="budget-category-details-status">{statusLabel}</span>
        </section>

        <section className="budget-category-details-card budget-category-details-financials">
          <div className="budget-category-details-section-title">
            <div>
              <span>Overview</span>
              <p>This month</p>
            </div>
          </div>
          <div className="budget-category-details-metrics">
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
              <strong className={getAvailableClass(category.available, isOverassignedSource)}>
                {formatMoney(category.available, currencyCode)}
              </strong>
            </div>
          </div>
        </section>

        {!isCreditCardPaymentCategory ? (
          <section className="budget-category-details-card budget-category-details-goal-card">
            <CategoryGoalInspectorSection
              budgetId={budgetId}
              category={category}
              currencyCode={currencyCode}
              managed={false}
              onAssignRecommendation={() => onAssignGoalRecommendation(category.id)}
            />
          </section>
        ) : (
          <section className="budget-category-details-card budget-category-details-managed">
            <div className="budget-category-details-section-title">
              <div>
                <span>Managed category</span>
                <p>Credit card payment funding</p>
              </div>
            </div>
            <p>
              This category tracks money reserved to pay this card and cannot be
              renamed or archived.
            </p>
          </section>
        )}

        <section className="budget-category-details-card">
          <div className="budget-category-details-section-title">
            <div>
              <span>Activity</span>
              <p>Transactions this month</p>
            </div>
            <strong>{formatMoney(category.activity, currencyCode)}</strong>
          </div>
          <button
            className="budget-category-details-row-action"
            type="button"
            onClick={() => onOpenActivity(category.id)}
            disabled={category.activity === 0}
          >
            <span>
              {category.activity === 0
                ? "No activity this month"
                : "View category activity"}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </section>

        <section className="budget-category-details-card">
          <div className="budget-category-details-section-title">
            <div>
              <span>Notes</span>
              <p>Category and group context</p>
            </div>
          </div>
          <div className="budget-category-details-note-block">
            <span>Category note</span>
            <p>{categoryNote || "No category note."}</p>
          </div>
          {groupNote ? (
            <div className="budget-category-details-note-block">
              <span>Group note</span>
              <p>{groupNote}</p>
            </div>
          ) : null}
        </section>

        {!isCreditCardPaymentCategory ? (
          <button
            className="button button-secondary budget-category-details-settings"
            type="button"
            onClick={() => onOpenSettings(category.id)}
          >
            Category Settings…
          </button>
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
  const yearMonths = BUDGET_MONTH_LABELS.map((label, monthIndex) => ({
    label,
    value: `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}`,
  }));
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
                  className="budget-year-step"
                  type="button"
                  onMouseEnter={() => prefetchMonth(addMonthsToBudgetMonth(selectedMonth, -12))}
                  onFocus={() => prefetchMonth(addMonthsToBudgetMonth(selectedMonth, -12))}
                  onClick={() =>
                    setSelectedMonth((currentMonth) =>
                      addMonthsToBudgetMonth(currentMonth, -12),
                    )
                  }
                  aria-label="Go to previous budget year"
                  title="Go to previous budget year"
                >
                  ‹
                </button>
                <span className="budget-year-label">{selectedYear}</span>
                <div className="budget-month-strip">
                  {yearMonths.map(({ label, value }) => {
                    const isSelected = value === selectedMonth;
                    const showWarning =
                      value === nextMonth &&
                      nextMonthOutlook?.status === "overbudget";

                    return (
                      <button
                        className={
                          isSelected
                            ? "budget-month-chip budget-month-chip-active"
                            : "budget-month-chip"
                        }
                        type="button"
                        key={value}
                        onMouseEnter={() => prefetchMonth(value)}
                        onFocus={() => prefetchMonth(value)}
                        onClick={() => setSelectedMonth(value)}
                        aria-current={isSelected ? "date" : undefined}
                        aria-label={`Open ${label} ${selectedYear} budget`}
                      >
                        <span>{label}</span>
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
                  className="budget-year-step"
                  type="button"
                  onMouseEnter={() => prefetchMonth(addMonthsToBudgetMonth(selectedMonth, 12))}
                  onFocus={() => prefetchMonth(addMonthsToBudgetMonth(selectedMonth, 12))}
                  onClick={() =>
                    setSelectedMonth((currentMonth) =>
                      addMonthsToBudgetMonth(currentMonth, 12),
                    )
                  }
                  aria-label="Go to next budget year"
                  title="Go to next budget year"
                >
                  ›
                </button>
              </nav>

              <div className="budget-planning-title">
                <div>
                  <h1>{data.monthLabel}</h1>
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
                <div className="budget-ready-summary-heading">
                  <span>Ready to Assign</span>
                  <strong>{formatMoney(data.readyToAssign, data.currencyCode)}</strong>
                </div>
                <dl>
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
                <div className="budget-ready-summary-total">
                  <span>Ready to Assign</span>
                  <strong>{formatMoney(data.readyToAssign, data.currencyCode)}</strong>
                </div>
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
            category={visibleSelectedCategory}
            group={visibleSelectedGroup}
            currencyCode={data.currencyCode}
            isOverassignedSource={selectedCategoryIsOverassignedSource}
            isCreditCardPaymentCategory={isCreditCardPaymentCategory(visibleSelectedCategory.id)}
            onAssignGoalRecommendation={assignGoalRecommendation}
            onOpenActivity={openActivityDrilldown}
            onOpenSettings={openCategorySettings}
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
