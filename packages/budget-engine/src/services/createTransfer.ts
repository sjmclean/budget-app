import { randomUUID } from "crypto";
import { Transaction } from "../../../types/src/Transaction.js";
import { ClearedStatus } from "../../../types/src/ClearedStatus.js";
import { TransactionType } from "../../../types/src/TransactionType.js";

export interface CreateTransferInput {
  budgetId: string;
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: number;
  memo?: string | null;
  clearedStatus?: ClearedStatus;
}

export interface TransferPair {
  outflow: Transaction;
  inflow: Transaction;
}

export function createTransfer(input: CreateTransferInput): TransferPair {
  if (input.amount <= 0) throw new Error("Transfer amount must be positive");
  const now = new Date();
  const transferId = randomUUID();
  return {
    outflow: {
      id: `${transferId}:out`,
      budgetId: input.budgetId,
      accountId: input.fromAccountId,
      payeeId: null,
      categoryId: null,
      transferAccountId: input.toAccountId,
      type: TransactionType.Transfer,
      date: input.date,
      memo: input.memo ?? null,
      amount: -input.amount,
      clearedStatus: input.clearedStatus ?? ClearedStatus.Uncleared,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
    inflow: {
      id: `${transferId}:in`,
      budgetId: input.budgetId,
      accountId: input.toAccountId,
      payeeId: null,
      categoryId: null,
      transferAccountId: input.fromAccountId,
      type: TransactionType.Transfer,
      date: input.date,
      memo: input.memo ?? null,
      amount: input.amount,
      clearedStatus: input.clearedStatus ?? ClearedStatus.Uncleared,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}
