export interface ScheduledTransactionSplitLine {
  id: string;
  scheduledTransactionId: string;
  categoryId: string;
  memo: string | null;
  amount: number;
  sortOrder: number;
}
