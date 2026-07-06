interface ReportEmptyStateProps {
  title: string;
  description: string;
}

export function ReportEmptyState({ title, description }: ReportEmptyStateProps) {
  return (
    <div className="report-empty-state">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
