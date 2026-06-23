import { randomUUID } from "crypto";
import { ScheduledTransaction } from "../../../types/src/ScheduledTransaction.js";
import { ScheduledTransactionSplitLine } from "../../../types/src/ScheduledTransactionSplitLine.js";
import { ScheduledFrequency } from "../../../types/src/ScheduledFrequency.js";
import { TransactionType } from "../../../types/src/TransactionType.js";
import { validateSplitTransaction } from "../validators/validateSplitTransaction.js";

export interface CreateScheduledSplitTransactionLineInput {
  categoryId: string;
  amount: number;
  memo?: string | null;
}

export interface CreateScheduledSplitTransactionInput {
  budgetId: string;
  accountId: string;
  payeeId?: string | null;
  amount: number;
  memo?: string | null;
  nextDueDate: string;
  frequency: ScheduledFrequency;
  lines: CreateScheduledSplitTransactionLineInput[];
}

export interface ScheduledSplitTransactionResult {
  scheduledTransaction: ScheduledTransaction;
  lines: ScheduledTransactionSplitLine[];
}

export function createScheduledSplitTransaction(input: CreateScheduledSplitTransactionInput): ScheduledSplitTransactionResult {
  validateSplitTransaction(input.amount, input.lines.map((line) => line.amount));

  const now = new Date();
  const scheduledTransaction: ScheduledTransaction = {
    id: randomUUID(),
    budgetId: input.budgetId,
    accountId: input.accountId,
    payeeId: input.payeeId ?? null,
    categoryId: null,
    transferAccountId: null,
    type: TransactionType.Split,
    amount: input.amount,
    memo: input.memo ?? null,
    nextDueDate: input.nextDueDate,
    frequency: input.frequency,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const lines = input.lines.map((line, index) => ({
    id: randomUUID(),
    scheduledTransactionId: scheduledTransaction.id,
    categoryId: line.categoryId,
    memo: line.memo ?? null,
    amount: line.amount,
    sortOrder: index,
  }));

  return { scheduledTransaction, lines };
}
