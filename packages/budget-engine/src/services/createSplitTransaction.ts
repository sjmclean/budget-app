import { randomUUID } from "crypto";
import { Transaction } from "../../../types/src/Transaction.js";
import { SplitTransactionLine } from "../../../types/src/SplitTransactionLine.js";
import { ClearedStatus } from "../../../types/src/ClearedStatus.js";
import { TransactionType } from "../../../types/src/TransactionType.js";
import { validateSplitTransaction } from "../validators/validateSplitTransaction.js";

export interface CreateSplitTransactionLineInput {
  categoryId: string;
  amount: number;
  memo?: string | null;
}

export interface CreateSplitTransactionInput {
  budgetId: string;
  accountId: string;
  payeeId?: string | null;
  date: string;
  amount: number;
  memo?: string | null;
  clearedStatus?: ClearedStatus;
  lines: CreateSplitTransactionLineInput[];
}

export interface SplitTransactionResult {
  transaction: Transaction;
  lines: SplitTransactionLine[];
}

export function createSplitTransaction(input: CreateSplitTransactionInput): SplitTransactionResult {
  validateSplitTransaction(input.amount, input.lines.map((line) => line.amount));

  const now = new Date();

  const transaction: Transaction = {
    id: randomUUID(),
    budgetId: input.budgetId,
    accountId: input.accountId,
    payeeId: input.payeeId ?? null,
    categoryId: null,
    transferAccountId: null,
    type: TransactionType.Split,
    date: input.date,
    memo: input.memo ?? null,
    amount: input.amount,
    clearedStatus: input.clearedStatus ?? ClearedStatus.Uncleared,
    isDeleted: false,
    createdAt: now,
    updatedAt: now
  };

  const lines = input.lines.map((line, index) => ({
    id: randomUUID(),
    transactionId: transaction.id,
    categoryId: line.categoryId,
    memo: line.memo ?? null,
    amount: line.amount,
    sortOrder: index
  }));

  return { transaction, lines };
}
