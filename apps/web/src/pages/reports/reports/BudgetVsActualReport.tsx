import { Card } from "../../../components/ui/Card";
import { ReportEmptyState } from "../components/ReportEmptyState";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportTableColumn } from "../components/ReportTable";
import { getCurrentReportMonth, type useReportsViewModel } from "../hooks/useReportsViewModel";
import type { BudgetVsActualRow } from "../services/budgetVsActualReport";

type ReportsViewModel = ReturnType<typeof useReportsViewModel>;

interface BudgetVsActualReportProps {
  viewModel: ReportsViewModel;
}

function statusLabel(status: BudgetVsActualRow["status"]): string {
  switch (status) {
    case "overspent":
      return "Overspent";
    case "fully-spent":
      return "Fully spent";
    case "on-track":
    default:
      return "On track";
  }
}

export function BudgetVsActualReport({ viewModel }: BudgetVsActualReportProps) {
  const {
    activeBudget,
    month,
    setMonth,
    formattedMonth,
    budgetVsActualRows,
    budgetVsActualTotals,
    selectedCategoryId,
    selectedSpendingRow,
    setSelectedCategoryId,
    isLoading,
    error,
    formatMoney,
  } = viewModel;

  const columns: ReportTableColumn<BudgetVsActualRow>[] = [
    {
      key: "category",
      label: "Category",
      render: (row) => (
        <span className="report-table-primary-cell">
          <strong>{row.categoryName}</strong>
          <small>{row.groupName}</small>
        </span>
      ),
    },
    {
      key: "assigned",
      label: "Assigned",
      align: "right",
      render: (row) => formatMoney(row.assigned),
    },
    {
      key: "activity",
      label: "Activity",
      align: "right",
      render: (row) => formatMoney(row.activity),
    },
    {
      key: "available",
      label: "Available",
      align: "right",
      render: (row) => formatMoney(row.available),
    },
    {
      key: "status",
      label: "Status",
      align: "right",
      render: (row) => <span className={`report-status-chip report-status-chip-${row.status}`}>{statusLabel(row.status)}</span>,
    },
  ];

  return (
    <Card className="workspace-panel budget-vs-actual-report-card">
      <ReportHeader
        title="Budget vs Actual"
        description={
          activeBudget
            ? `Compare assigned, activity, and available amounts for ${activeBudget.name} in ${formattedMonth}.`
            : "Select a budget to view reports."
        }
        month={month}
        onMonthChange={setMonth}
        fallbackMonth={getCurrentReportMonth()}
      />

      {error ? <ReportEmptyState title="Unable to load report" description={error} /> : null}
      {isLoading ? <ReportEmptyState title="Loading report" description="Calculating budget performance for the selected month…" /> : null}

      {!isLoading && !error ? (
        <div className="budget-vs-actual-layout">
          <div className="budget-vs-actual-summary" aria-label="Budget vs actual totals">
            <span>
              <small>Assigned</small>
              <strong>{formatMoney(budgetVsActualTotals.assigned)}</strong>
            </span>
            <span>
              <small>Activity</small>
              <strong>{formatMoney(budgetVsActualTotals.activity)}</strong>
            </span>
            <span>
              <small>Available</small>
              <strong>{formatMoney(budgetVsActualTotals.available)}</strong>
            </span>
            <span>
              <small>Overspent</small>
              <strong>{budgetVsActualTotals.overspentCount}</strong>
            </span>
          </div>

          {budgetVsActualRows.length === 0 ? (
            <ReportEmptyState
              title="No budget activity found"
              description="No assigned, activity, or available category amounts were found for this period. Try selecting another month."
            />
          ) : (
            <ReportTable
              ariaLabel="Budget vs actual rows"
              columns={columns}
              rows={budgetVsActualRows}
              getRowKey={(row) => row.categoryId}
              onRowClick={(row) => setSelectedCategoryId(row.categoryId)}
            />
          )}

          {selectedCategoryId ? (
            <div className="budget-vs-actual-drilldown">
              <div className="panel-header">
                <div>
                  <h3>{selectedSpendingRow?.categoryName ?? "Selected category"}</h3>
                  <p className="muted">
                    {selectedSpendingRow
                      ? `${selectedSpendingRow.transactions.length} transactions · ${formatMoney(selectedSpendingRow.total)}`
                      : "No categorised outflows were found for this category in the selected month."}
                  </p>
                </div>
              </div>

              {selectedSpendingRow ? (
                <div className="spending-transaction-list">
                  <div className="spending-transaction-row spending-transaction-row-heading" aria-hidden="true">
                    <span>Date</span>
                    <span>Payee</span>
                    <span>Amount</span>
                  </div>
                  {selectedSpendingRow.transactions.map((transaction) => (
                    <div className="spending-transaction-row" key={transaction.id}>
                      <span>{transaction.date}</span>
                      <strong>{transaction.payee || "No payee"}</strong>
                      <strong>{formatMoney(transaction.outflow)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <ReportEmptyState
                  title="No transactions found"
                  description="This category has budget values but no categorised spending transactions for the selected period."
                />
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
