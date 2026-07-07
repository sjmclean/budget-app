import { Card } from "../../../components/ui/Card";
import { ReportEmptyState } from "../components/ReportEmptyState";
import { ReportHeader } from "../components/ReportHeader";
import { currentReportMonth, type useReportsViewModel } from "../hooks/useReportsViewModel";
import { CategoryLabel } from "../../../features/icons/CategoryIcon";

type ReportsViewModel = ReturnType<typeof useReportsViewModel>;

interface SpendingByCategoryReportProps {
  viewModel: ReportsViewModel;
}

export function SpendingByCategoryReport({ viewModel }: SpendingByCategoryReportProps) {
  const {
    activeBudget,
    month,
    setMonth,
    formattedMonth,
    spendingRows,
    selectedSpendingRow,
    setSelectedCategoryId,
    totalSpending,
    isLoading,
    error,
    formatMoney,
  } = viewModel;

  return (
    <Card className="workspace-panel spending-report-card">
      <ReportHeader
        title="Spending by Category"
        description={
          activeBudget
            ? `See categorised spending for ${activeBudget.name} in ${formattedMonth}.`
            : "Select a budget to view reports."
        }
        month={month}
        onMonthChange={setMonth}
        fallbackMonth={currentReportMonth}
      />

      {error ? <ReportEmptyState title="Unable to load report" description={error} /> : null}
      {isLoading ? (
        <ReportEmptyState title="Loading report" description="Calculating spending for the selected month…" />
      ) : null}

      {!isLoading && !error ? (
        <div className="spending-report-layout">
          <div className="spending-report-list" aria-label="Spending by category rows">
            <div className="spending-report-total">
              <span>Total spending</span>
              <strong>{formatMoney(totalSpending)}</strong>
            </div>

            {spendingRows.length === 0 ? (
              <ReportEmptyState
                title="No spending recorded"
                description="No categorised outflows were found for this period. Try selecting another month."
              />
            ) : (
              spendingRows.map((row) => {
                const percentage = totalSpending > 0 ? Math.round((row.total / totalSpending) * 100) : 0;
                return (
                  <button
                    className={`spending-category-row ${row.categoryId === selectedSpendingRow?.categoryId ? "spending-category-row-selected" : ""}`}
                    key={row.categoryId}
                    onClick={() => setSelectedCategoryId(row.categoryId)}
                    type="button"
                  >
                    <span>
                      <strong><CategoryLabel categoryName={row.categoryName} /></strong>
                      <small>{row.groupName}</small>
                    </span>
                    <span className="spending-category-amount">
                      <strong>{formatMoney(row.total)}</strong>
                      <small>{percentage}%</small>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="spending-report-detail">
            {selectedSpendingRow ? (
              <>
                <div className="panel-header">
                  <div>
                    <h3><CategoryLabel categoryName={selectedSpendingRow.categoryName} /></h3>
                    <p className="muted">
                      {selectedSpendingRow.transactions.length} transactions · {formatMoney(selectedSpendingRow.total)}
                    </p>
                  </div>
                </div>

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
              </>
            ) : (
              <ReportEmptyState title="Choose a category" description="Select a category to see the transactions behind it." />
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
