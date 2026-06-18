import { ScheduledFrequency } from "./ScheduledFrequency.js";
import { TransactionType } from "./TransactionType.js";

export interface ScheduledTransaction {
  id: string;
  budgetId: string;
  accountId: string;
  payeeId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  type: TransactionType;
  amount: number;
  memo: string | null;
  nextDueDate: string;
  frequency: ScheduledFrequency;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
