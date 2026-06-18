export interface SplitTransactionLine {
  id: string;
  transactionId: string;
  categoryId: string;
  memo: string | null;
  amount: number;
  sortOrder: number;
}
