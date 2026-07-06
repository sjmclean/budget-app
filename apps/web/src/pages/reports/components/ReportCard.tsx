import { Card } from "../../../components/ui/Card";
import type { ReportCardDefinition } from "../reportCatalogue";

interface ReportCardProps {
  report: ReportCardDefinition;
}

export function ReportCard({ report }: ReportCardProps) {
  const isAvailable = report.status === "available";

  return (
    <Card className={`report-catalogue-card ${isAvailable ? "report-catalogue-card-active" : ""}`}>
      <div className="report-card-content">
        <span className="report-card-icon" aria-hidden="true">
          {isAvailable ? "↗" : "•"}
        </span>
        <div>
          <h2>{report.title}</h2>
          <p className="muted">{report.description}</p>
        </div>
      </div>
      <span className="report-status-pill">{isAvailable ? "Open report" : "Coming soon"}</span>
    </Card>
  );
}
