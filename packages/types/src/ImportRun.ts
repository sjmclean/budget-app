export enum ImportSource {
  YNAB4 = "YNAB4",
  CSV = "CSV",
  Manual = "Manual"
}

export interface ImportRun {
  id: string;
  budgetId: string;
  userId: string;
  source: ImportSource;
  sourceFileName: string | null;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  summaryJson: string;
}
