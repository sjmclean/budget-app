import { Card } from "../components/ui/Card";

const reports = [
  "Net Worth",
  "Income vs Expense",
  "Spending Trends",
  "Category Trends",
  "Cashflow Forecast",
  "Goal Progress",
];

export function ReportsPage() {
  return (
    <div className="page-stack">
      <section className="workspace-header">
        <div>
          <h1>Reports</h1>
          <p className="muted">
            Placeholder report catalogue for future reporting milestones.
          </p>
        </div>
      </section>

      <section className="report-grid">
        {reports.map((report) => (
          <Card key={report}>
            <h2>{report}</h2>
            <p className="muted">Coming in a later reporting milestone.</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
