import type { NewRegisterTransactionInput, TransactionFlag } from "./accountRegisterTypes";
import { findPayeeIdByName, payeeService } from "./payeeService";

export type ScheduledFrequency = "once" | "weekly" | "fortnightly" | "monthly" | "yearly";

export interface ScheduledTransactionView {
  id: string;
  accountId: string;
  flag: TransactionFlag;
  nextDueDate: string;
  frequency: ScheduledFrequency;
  payee: string;
  payeeId?: string;
  category: string;
  memo?: string;
  outflow: number;
  inflow: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertScheduledTransactionInput {
  id?: string;
  accountId: string;
  flag: TransactionFlag;
  nextDueDate: string;
  frequency: ScheduledFrequency;
  payee: string;
  payeeId?: string;
  category: string;
  memo?: string;
  outflow: number;
  inflow: number;
}

const STORAGE_KEY = "budget-app.scheduled-transactions.v1";

class BrowserPersistentScheduledTransactionService {
  async listByAccount(accountId: string): Promise<ScheduledTransactionView[]> {
    return readScheduledTransactions()
      .filter((transaction) => transaction.accountId === accountId)
      .sort(compareScheduledTransactions);
  }

  async dueCountByAccount(accountId: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const transactions = await this.listByAccount(accountId);
    return transactions.filter((transaction) => transaction.nextDueDate <= today).length;
  }

  async create(input: UpsertScheduledTransactionInput): Promise<ScheduledTransactionView[]> {
    await payeeService.recordPayee(input.payee);
    const payeeId = resolvePayeeId(input.payee, input.payeeId);

    const transactions = readScheduledTransactions();
    const now = new Date().toISOString();
    const next: ScheduledTransactionView = {
      id: createId(),
      accountId: input.accountId,
      flag: input.flag,
      nextDueDate: input.nextDueDate,
      frequency: input.frequency,
      payee: input.payee,
      payeeId,
      category: normaliseScheduledCategory(input),
      memo: input.memo,
      outflow: input.outflow,
      inflow: input.inflow,
      createdAt: now,
      updatedAt: now,
    };

    writeScheduledTransactions([...transactions, next]);
    return this.listByAccount(input.accountId);
  }

  async update(input: UpsertScheduledTransactionInput & { id: string }): Promise<ScheduledTransactionView[]> {
    await payeeService.recordPayee(input.payee);
    const payeeId = resolvePayeeId(input.payee, input.payeeId);

    const now = new Date().toISOString();
    const transactions = readScheduledTransactions().map((transaction) => {
      if (transaction.id !== input.id) {
        return transaction;
      }

      return {
        ...transaction,
        accountId: input.accountId,
        flag: input.flag,
        nextDueDate: input.nextDueDate,
        frequency: input.frequency,
        payee: input.payee,
        payeeId,
        category: normaliseScheduledCategory(input),
        memo: input.memo,
        outflow: input.outflow,
        inflow: input.inflow,
        updatedAt: now,
      };
    });

    writeScheduledTransactions(transactions);
    return this.listByAccount(input.accountId);
  }

  async delete(accountId: string, scheduledTransactionId: string): Promise<ScheduledTransactionView[]> {
    writeScheduledTransactions(
      readScheduledTransactions().filter((transaction) => transaction.id !== scheduledTransactionId),
    );
    return this.listByAccount(accountId);
  }

  async advanceAfterEnter(
    accountId: string,
    scheduledTransactionId: string,
  ): Promise<ScheduledTransactionView[]> {
    const transactions = readScheduledTransactions();
    const target = transactions.find((transaction) => transaction.id === scheduledTransactionId);

    if (!target) {
      return this.listByAccount(accountId);
    }

    if (target.frequency === "once") {
      writeScheduledTransactions(
        transactions.filter((transaction) => transaction.id !== scheduledTransactionId),
      );
      return this.listByAccount(accountId);
    }

    const now = new Date().toISOString();
    writeScheduledTransactions(
      transactions.map((transaction) =>
        transaction.id === scheduledTransactionId
          ? {
              ...transaction,
              nextDueDate: advanceDate(transaction.nextDueDate, transaction.frequency),
              updatedAt: now,
            }
          : transaction,
      ),
    );

    return this.listByAccount(accountId);
  }

  toRegisterInput(transaction: ScheduledTransactionView): NewRegisterTransactionInput {
    return {
      date: transaction.nextDueDate,
      flag: transaction.flag,
      payee: transaction.payee,
      payeeId: transaction.payeeId,
      category: transaction.category,
      memo: transaction.memo,
      outflow: transaction.outflow,
      inflow: transaction.inflow,
    };
  }
}

export const scheduledTransactionService = new BrowserPersistentScheduledTransactionService();

function readScheduledTransactions(): ScheduledTransactionView[] {
  if (typeof window === "undefined") {
    return [];
  }

  const value = window.localStorage.getItem(STORAGE_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as ScheduledTransactionView[];
    return Array.isArray(parsed) ? parsed.map(normaliseStoredScheduledTransaction) : [];
  } catch {
    return [];
  }
}

function writeScheduledTransactions(transactions: ScheduledTransactionView[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions.map(normaliseStoredScheduledTransaction)));
}

function normaliseStoredScheduledTransaction(
  transaction: ScheduledTransactionView,
): ScheduledTransactionView {
  return {
    ...transaction,
    flag: transaction.flag ?? null,
    memo: transaction.memo ?? "",
    payeeId: transaction.payeeId ?? findPayeeIdByName(transaction.payee),
    outflow: Number.isFinite(transaction.outflow) ? transaction.outflow : 0,
    inflow: Number.isFinite(transaction.inflow) ? transaction.inflow : 0,
  };
}

function resolvePayeeId(payeeName: string, currentPayeeId?: string): string | undefined {
  return currentPayeeId ?? findPayeeIdByName(payeeName);
}

function normaliseScheduledCategory(input: Pick<UpsertScheduledTransactionInput, "category" | "inflow" | "outflow">): string {
  const category = input.category.trim();

  if (category) {
    return category;
  }

  return input.inflow > 0 && input.outflow === 0 ? "Ready to Assign" : "Uncategorised";
}

function compareScheduledTransactions(
  a: ScheduledTransactionView,
  b: ScheduledTransactionView,
): number {
  const dateCompare = a.nextDueDate.localeCompare(b.nextDueDate);
  if (dateCompare !== 0) return dateCompare;
  return a.payee.localeCompare(b.payee);
}

function advanceDate(date: string, frequency: ScheduledFrequency): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day);

  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (frequency === "fortnightly") {
    next.setDate(next.getDate() + 14);
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else if (frequency === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  }

  return [
    String(next.getFullYear()).padStart(4, "0"),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `scheduled-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
