interface ReportHeaderProps {
  title: string;
  description: string;
  month: string;
  onMonthChange: (month: string) => void;
  fallbackMonth: string;
}

export function ReportHeader({ title, description, month, onMonthChange, fallbackMonth }: ReportHeaderProps) {
  return (
    <div className="report-panel-header">
      <div>
        <p className="eyebrow">Report</p>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>

      <label className="report-period-control">
        <span>Period</span>
        <input type="month" value={month} onChange={(event) => onMonthChange(event.target.value || fallbackMonth)} />
      </label>
    </div>
  );
}
