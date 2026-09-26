import { Card } from "../../../components/ui/Card";
import { ReportEmptyState } from "../components/ReportEmptyState";
import { ReportHeader } from "../components/ReportHeader";
import { getCurrentReportMonth, type useReportsViewModel } from "../hooks/useReportsViewModel";

type ReportsViewModel = ReturnType<typeof useReportsViewModel>;

interface IncomeExpensesReportProps {
  viewModel: ReportsViewModel;
}

export function IncomeExpensesReport({ viewModel }: IncomeExpensesReportProps) {
  const {
    activeBudget,
    month,
    setMonth,
    formattedMonth,
    financialOverview,
    isLoading,
    error,
    formatMoney,
  } = viewModel;

  return (
    <Card className="workspace-panel income-expenses-report-card">
      <ReportHeader
        title="Income & Expenses"
        description={
          activeBudget
            ? `Review canonical income and expenses for ${activeBudget.name} in ${formattedMonth}.`
            : "Select a budget to view reports."
        }
        month={month}
        onMonthChange={setMonth}
        fallbackMonth={getCurrentReportMonth()}
      />

      {error ? <ReportEmptyState title="Unable to load report" description={error} /> : null}
      {isLoading ? (
        <ReportEmptyState
          title="Loading report"
          description="Classifying income, category inflows, and expenses for the selected month…"
        />
      ) : null}

      {!isLoading && !error && financialOverview ? (
        <div className="income-expenses-report-layout">
          <div className="income-expenses-summary" aria-label="Income and expenses totals">
            <span>
              <small>Income</small>
              <strong>{formatMoney(financialOverview.monthlySnapshot.income)}</strong>
            </span>
            <span>
              <small>Expenses</small>
              <strong>{formatMoney(financialOverview.monthlySnapshot.expenses)}</strong>
            </span>
            <span>
              <small>Savings</small>
              <strong>{formatMoney(financialOverview.monthlySnapshot.savings)}</strong>
            </span>
          </div>

          <div className="income-expenses-breakdown" aria-label="Income classification breakdown">
            <div>
              <span>
                <strong>General income</strong>
                <small>Income assigned to the transaction month or following month.</small>
              </span>
              <strong>{formatMoney(financialOverview.monthlySnapshot.generalIncome)}</strong>
            </div>
            <div>
              <span>
                <strong>Counted category income</strong>
                <small>Category inflows explicitly marked “Count as income”.</small>
              </span>
              <strong>{formatMoney(financialOverview.monthlySnapshot.countedCategoryIncome)}</strong>
            </div>
            <div>
              <span>
                <strong>Category inflows</strong>
                <small>Ordinary refunds or reimbursements. These are not included in headline income or savings.</small>
              </span>
              <strong>{formatMoney(financialOverview.monthlySnapshot.categoryInflows)}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
