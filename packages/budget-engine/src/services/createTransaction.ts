import { randomUUID } from "crypto";
import { Transaction } from "../../../types/src/Transaction.js";
import { ClearedStatus } from "../../../types/src/ClearedStatus.js";
import { TransactionType } from "../../../types/src/TransactionType.js";

export interface CreateTransactionInput {
  budgetId: string;
  accountId: string;
  payeeId?: string | null;
  categoryId?: string | null;
  date: string;
  amount: number;
  memo?: string | null;
  checkNumber?: string | null;
  clearedStatus?: ClearedStatus;
  type?: TransactionType;
}

export function createTransaction(input: CreateTransactionInput): Transaction {
  const now = new Date();
  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    accountId: input.accountId,
    payeeId: input.payeeId ?? null,
    categoryId: input.categoryId ?? null,
    transferAccountId: null,
    type: input.type ?? TransactionType.Standard,
    date: input.date,
    memo: input.memo ?? null,
    checkNumber: normaliseCheckNumber(input.checkNumber),
    amount: input.amount,
    clearedStatus: input.clearedStatus ?? ClearedStatus.Uncleared,
    isDeleted: false,
    createdAt: now,
    updatedAt: now
  };
}

function normaliseCheckNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
