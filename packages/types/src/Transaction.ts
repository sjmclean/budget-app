import { ClearedStatus } from "./ClearedStatus.js";
import { TransactionType } from "./TransactionType.js";

export interface Transaction {
  id: string;
  budgetId: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  type: TransactionType;
  date: string;
  memo: string | null;
  amount: number;
  clearedStatus: ClearedStatus;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
