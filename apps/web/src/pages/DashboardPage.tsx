import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { resolveActiveBudget } from "../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../features/budget/budgetMonthNavigation";
import { getAppPersistenceGateway } from "../features/persistence/appPersistenceGatewayFactory";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import {
  buildFinancialOverviewSummary,
  type FinancialOverviewSummary,
  type NetWorthPoint,
} from "./dashboard/services/financialOverview";
import { formatCurrency } from "./reports/services/reportFormatting";


export function DashboardPage() {
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);
  const currencyCode = activeBudget?.currency ?? "AUD";
  const [overviewMonth, setOverviewMonth] = useState(() =>
    getCurrentBudgetMonth(),
  );
  const [summary, setSummary] = useState<FinancialOverviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!activeBudget) {
        setSummary(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const gateway = getAppPersistenceGateway();
        const accounts = await gateway.accounts.listAccounts();
        const registers = await Promise.all(
          accounts.map((account) => gateway.accountRegisters.getAccountRegisterView({ accountId: account.id })),
        );
        const budgetView = await gateway.budgetView.getBudgetMonthView({
          budgetId: activeBudget.id,
          month: overviewMonth,
        });
        const nextSummary = buildFinancialOverviewSummary({
          accounts,
          registers,
          budgetView,
          month: overviewMonth,
        });

        if (!cancelled) {
          setSummary(nextSummary);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSummary(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load the financial overview.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [activeBudget, overviewMonth]);

  useEffect(() => {
    function refreshCurrentMonth() {
      setOverviewMonth(getCurrentBudgetMonth());
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshCurrentMonth();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshCurrentMonth);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshCurrentMonth);
    };
  }, []);

  const formatMoney = useMemo(() => {
    return (amount: number) => formatCurrency(amount, currencyCode);
  }, [currencyCode]);

  if (!activeBudget) {
    return (
      <div className="financial-overview-page">
        <Card className="financial-overview-empty-card">
          <h1>Financial Overview</h1>
          <p className="muted">Open or create a budget to see your financial overview.</p>
          <Link className="button-primary" to="/budgets">
            Open Budget Manager
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="financial-overview-page">
      <section className="financial-overview-header">
        <div>
          <p className="eyebrow">Financial Overview</p>
          <h1>{activeBudget.name}</h1>
          <p className="muted">A concise briefing for {summary?.monthLabel ?? "this month"}.</p>
        </div>
      </section>

      {error ? (
        <Card className="financial-overview-empty-card financial-overview-error-card">
          <h2>Overview unavailable</h2>
          <p className="muted">{error}</p>
        </Card>
      ) : null}

      {isLoading && !summary ? (
        <Card className="financial-overview-empty-card">
          <h2>Loading overview…</h2>
          <p className="muted">Preparing your financial briefing.</p>
        </Card>
      ) : null}

      {summary ? (
        <>
          <section className="financial-overview-hero-grid">
            <Card className="financial-overview-net-worth-card">
              <div className="financial-overview-card-header">
                <div>
                  <p className="eyebrow">Net Worth</p>
                  <strong>{formatMoney(summary.netWorth)}</strong>
                </div>
                <Link to="/reports" className="text-link">
                  View report →
                </Link>
              </div>

              <NetWorthTrendChart points={summary.netWorthTrend} formatMoney={formatMoney} />

              <div className="financial-overview-change-row">
                <ChangePill label="This month" amount={summary.netWorthChangeThisMonth} formatMoney={formatMoney} />
                <ChangePill label="12 months" amount={summary.netWorthChangePeriod} formatMoney={formatMoney} />
              </div>
            </Card>

            <Card className="financial-overview-month-card">
              <p className="eyebrow">This Month</p>
              <div className="financial-overview-metric-list">
                <MetricRow label="Income" value={formatMoney(summary.monthlySnapshot.income)} />
                <MetricRow label="Expenses" value={formatMoney(summary.monthlySnapshot.expenses)} />
                <MetricRow label="Savings" value={formatMoney(summary.monthlySnapshot.savings)} emphasis />
                <MetricRow label="Ready to Assign" value={formatMoney(summary.monthlySnapshot.readyToAssign)} />
              </div>
            </Card>
          </section>

          <section className="financial-overview-lower-grid">
            <Card className="financial-overview-attention-card">
              <div className="financial-overview-card-header compact">
                <div>
                  <p className="eyebrow">Needs Attention</p>
                  <h2>{hasAttention(summary) ? "Review these items" : "Everything looks good"}</h2>
                </div>
              </div>

              {hasAttention(summary) ? (
                <div className="financial-overview-action-list">
                  {summary.attention.overspentCategories > 0 ? (
                    <Link to="/budget" className="financial-overview-action-row">
                      <div>
                        <strong>{summary.attention.overspentCategories} overspent categories</strong>
                        <span>Review the Budget screen and cover overspending.</span>
                      </div>
                      <span>Review →</span>
                    </Link>
                  ) : null}

                  {summary.attention.uncategorisedTransactions > 0 ? (
                    <Link to="/transactions" className="financial-overview-action-row">
                      <div>
                        <strong>{summary.attention.uncategorisedTransactions} uncategorised transactions</strong>
                        <span>Assign categories so reports and budgets stay accurate.</span>
                      </div>
                      <span>Review →</span>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <p className="financial-overview-positive-state">No action required right now.</p>
              )}
            </Card>

            <Card className="financial-overview-insights-card">
              <p className="eyebrow">Financial Insights</p>
              <div className="financial-overview-insight-list">
                <p>{buildNetWorthInsight(summary, formatMoney)}</p>
                <p>{buildSavingsInsight(summary, formatMoney)}</p>
              </div>
            </Card>

            <Card className="financial-overview-quick-links-card">
              <p className="eyebrow">Continue Working</p>
              <div className="financial-overview-quick-links">
                <Link to="/budget">Open Budget →</Link>
                <Link to="/transactions">Open Register →</Link>
                <Link to="/reports">Open Reports →</Link>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "financial-overview-metric-row emphasis" : "financial-overview-metric-row"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChangePill({ label, amount, formatMoney }: { label: string; amount: number; formatMoney: (amount: number) => string }) {
  const isPositive = amount >= 0;
  return (
    <div className={isPositive ? "financial-overview-change positive" : "financial-overview-change negative"}>
      <span>{label}</span>
      <strong>
        {isPositive ? "+" : ""}
        {formatMoney(amount)}
      </strong>
    </div>
  );
}

function NetWorthTrendChart({ points, formatMoney }: { points: NetWorthPoint[]; formatMoney: (amount: number) => string }) {
  const path = buildSparklinePath(points);
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));

  return (
    <div className="financial-overview-chart" aria-label="12 month net worth trend">
      <svg viewBox="0 0 640 180" role="img">
        <title>Net worth trend</title>
        <desc>
          Net worth ranges from {formatMoney(min)} to {formatMoney(max)} across the last {points.length} months.
        </desc>
        <line x1="0" x2="640" y1="150" y2="150" className="financial-overview-chart-grid" />
        <line x1="0" x2="640" y1="90" y2="90" className="financial-overview-chart-grid" />
        <line x1="0" x2="640" y1="30" y2="30" className="financial-overview-chart-grid" />
        {path ? <path d={path} className="financial-overview-chart-line" /> : null}
      </svg>
      <div className="financial-overview-chart-labels" aria-hidden="true">
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  );
}

function buildSparklinePath(points: NetWorthPoint[]): string {
  if (points.length === 0) return "";

  const width = 640;
  const height = 140;
  const topPadding = 20;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  return points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = topPadding + height - ((point.value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function hasAttention(summary: FinancialOverviewSummary): boolean {
  return summary.attention.overspentCategories > 0 || summary.attention.uncategorisedTransactions > 0;
}

function buildNetWorthInsight(summary: FinancialOverviewSummary, formatMoney: (amount: number) => string): string {
  if (summary.netWorthChangeThisMonth === 0) {
    return "Net worth is unchanged this month.";
  }

  return `Net worth ${summary.netWorthChangeThisMonth > 0 ? "increased" : "decreased"} by ${formatMoney(Math.abs(summary.netWorthChangeThisMonth))} this month.`;
}

function buildSavingsInsight(summary: FinancialOverviewSummary, formatMoney: (amount: number) => string): string {
  if (summary.monthlySnapshot.savings >= 0) {
    return `Income exceeds expenses by ${formatMoney(summary.monthlySnapshot.savings)} this month.`;
  }

  return `Expenses exceed income by ${formatMoney(Math.abs(summary.monthlySnapshot.savings))} this month.`;
}
