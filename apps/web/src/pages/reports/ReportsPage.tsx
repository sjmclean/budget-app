import { ReportCard } from "./components/ReportCard";
import { reportCards } from "./reportCatalogue";
import { SpendingByCategoryReport } from "./reports/SpendingByCategoryReport";
import { BudgetVsActualReport } from "./reports/BudgetVsActualReport";
import { useReportsViewModel } from "./hooks/useReportsViewModel";

export function ReportsPage() {
  const reportsViewModel = useReportsViewModel();

  return (
    <div className="page-stack reports-page">
      <section className="workspace-header">
        <div>
          <h1>Reports</h1>
          <p className="muted">
            Answer practical questions about spending, income, balances, and budget performance.
          </p>
        </div>
      </section>

      <section className="report-grid report-catalogue-grid">
        {reportCards.map((report) => (
          <ReportCard key={report.title} report={report} />
        ))}
      </section>

      <SpendingByCategoryReport viewModel={reportsViewModel} />
      <BudgetVsActualReport viewModel={reportsViewModel} />
    </div>
  );
}
