import { randomUUID } from "crypto";
import { ScheduledTransaction } from "../../../types/src/ScheduledTransaction.js";
import { ScheduledFrequency } from "../../../types/src/ScheduledFrequency.js";
import { TransactionType } from "../../../types/src/TransactionType.js";

export interface CreateScheduledTransactionInput {
  budgetId: string;
  accountId: string;
  payeeId?: string | null;
  categoryId?: string | null;
  transferAccountId?: string | null;
  type?: TransactionType;
  amount: number;
  memo?: string | null;
  nextDueDate: string;
  frequency: ScheduledFrequency;
}

export function createScheduledTransaction(input: CreateScheduledTransactionInput): ScheduledTransaction {
  const now = new Date();
  return { id: randomUUID(), budgetId: input.budgetId, accountId: input.accountId, payeeId: input.payeeId ?? null, categoryId: input.categoryId ?? null, transferAccountId: input.transferAccountId ?? null, type: input.type ?? TransactionType.Standard, amount: input.amount, memo: input.memo ?? null, nextDueDate: input.nextDueDate, frequency: input.frequency, isActive: true, createdAt: now, updatedAt: now };
}
