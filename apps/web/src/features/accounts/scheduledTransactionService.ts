import type { NewRegisterTransactionInput, RegisterTransactionView, TransactionFlag } from "./accountRegisterTypes";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";


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
  splitLines?: RegisterTransactionView["splitLines"];
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
  splitLines?: RegisterTransactionView["splitLines"];
}

const STORAGE_KEY = "budget-app.scheduled-transactions.v1";

export interface ScheduledTransactionServiceDependencies {
  storage: KeyValueStoragePort;
  recordPayee(payeeName: string): Promise<void>;
  findPayeeIdByName(payeeName: string): string | undefined;
}

export class BrowserPersistentScheduledTransactionService {
  constructor(private readonly dependencies: ScheduledTransactionServiceDependencies) {}
  async listByAccount(accountId: string): Promise<ScheduledTransactionView[]> {
    return readScheduledTransactions(this.dependencies)
      .filter((transaction) => transaction.accountId === accountId)
      .sort(compareScheduledTransactions);
  }

  async dueCountByAccount(accountId: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const transactions = await this.listByAccount(accountId);
    return transactions.filter((transaction) => transaction.nextDueDate <= today).length;
  }

  async create(input: UpsertScheduledTransactionInput): Promise<ScheduledTransactionView[]> {
    await this.dependencies.recordPayee(input.payee);
    const payeeId = resolvePayeeId(this.dependencies, input.payee, input.payeeId);

    const transactions = readScheduledTransactions(this.dependencies);
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
      splitLines: cloneSplitLines(input.splitLines),
      createdAt: now,
      updatedAt: now,
    };

    writeScheduledTransactions(this.dependencies.storage, [...transactions, next]);
    return this.listByAccount(input.accountId);
  }

  async update(input: UpsertScheduledTransactionInput & { id: string }): Promise<ScheduledTransactionView[]> {
    await this.dependencies.recordPayee(input.payee);
    const payeeId = resolvePayeeId(this.dependencies, input.payee, input.payeeId);

    const now = new Date().toISOString();
    const transactions = readScheduledTransactions(this.dependencies).map((transaction) => {
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
        splitLines: cloneSplitLines(input.splitLines),
        updatedAt: now,
      };
    });

    writeScheduledTransactions(this.dependencies.storage, transactions);
    return this.listByAccount(input.accountId);
  }

  async delete(accountId: string, scheduledTransactionId: string): Promise<ScheduledTransactionView[]> {
    writeScheduledTransactions(
      this.dependencies.storage,
      readScheduledTransactions(this.dependencies).filter((transaction) => transaction.id !== scheduledTransactionId),
    );
    return this.listByAccount(accountId);
  }

  async advanceAfterEnter(
    accountId: string,
    scheduledTransactionId: string,
  ): Promise<ScheduledTransactionView[]> {
    const transactions = readScheduledTransactions(this.dependencies);
    const target = transactions.find((transaction) => transaction.id === scheduledTransactionId);

    if (!target) {
      return this.listByAccount(accountId);
    }

    if (target.frequency === "once") {
      writeScheduledTransactions(
        this.dependencies.storage,
        transactions.filter((transaction) => transaction.id !== scheduledTransactionId),
      );
      return this.listByAccount(accountId);
    }

    const now = new Date().toISOString();
    writeScheduledTransactions(
      this.dependencies.storage,
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
      splitLines: cloneSplitLines(transaction.splitLines),
    };
  }

  async renamePayeeReferences(input: {
    payeeId: string;
    previousName: string;
    nextName: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const transactions = readScheduledTransactions(this.dependencies).map((transaction) => {
      if (!isScheduledPayeeReferenceMatch(transaction, input.payeeId, input.previousName)) {
        return transaction;
      }

      return {
        ...transaction,
        payee: input.nextName,
        payeeId: input.payeeId,
        updatedAt: now,
      };
    });

    writeScheduledTransactions(this.dependencies.storage, transactions);
  }

  async reassignPayeeReferences(input: {
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const transactions = readScheduledTransactions(this.dependencies).map((transaction) => {
      if (!isScheduledPayeeReferenceMatch(transaction, input.sourcePayeeId, input.sourceName)) {
        return transaction;
      }

      return {
        ...transaction,
        payee: input.targetName,
        payeeId: input.targetPayeeId,
        updatedAt: now,
      };
    });

    writeScheduledTransactions(this.dependencies.storage, transactions);
  }
}

export function createScheduledTransactionService(
  dependencies: ScheduledTransactionServiceDependencies,
): BrowserPersistentScheduledTransactionService {
  return new BrowserPersistentScheduledTransactionService(dependencies);
}


function isScheduledPayeeReferenceMatch(
  transaction: ScheduledTransactionView,
  payeeId: string,
  previousName: string,
): boolean {
  if (transaction.payee.startsWith("Transfer:")) {
    return false;
  }

  if (transaction.payeeId) {
    return transaction.payeeId === payeeId;
  }

  return normalisePayeeReference(transaction.payee) === normalisePayeeReference(previousName);
}

function normalisePayeeReference(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function readScheduledTransactions(
  dependencies?: ScheduledTransactionServiceDependencies,
): ScheduledTransactionView[] {
  const value = dependencies?.storage.getItem(STORAGE_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as ScheduledTransactionView[];
    return Array.isArray(parsed) ? parsed.map((transaction) => normaliseStoredScheduledTransaction(transaction, dependencies)) : [];
  } catch {
    return [];
  }
}

function writeScheduledTransactions(
  storage: KeyValueStoragePort,
  transactions: ScheduledTransactionView[],
): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      transactions.map((transaction) => normaliseStoredScheduledTransaction(transaction)),
    ),
  );
}

function normaliseStoredScheduledTransaction(
  transaction: ScheduledTransactionView,
  dependencies?: ScheduledTransactionServiceDependencies,
): ScheduledTransactionView {
  return {
    ...transaction,
    flag: transaction.flag ?? null,
    memo: transaction.memo ?? "",
    payeeId: transaction.payeeId ?? dependencies?.findPayeeIdByName(transaction.payee),
    outflow: Number.isFinite(transaction.outflow) ? transaction.outflow : 0,
    inflow: Number.isFinite(transaction.inflow) ? transaction.inflow : 0,
    splitLines: cloneSplitLines(transaction.splitLines),
  };
}

function resolvePayeeId(
  dependencies: ScheduledTransactionServiceDependencies,
  payeeName: string,
  currentPayeeId?: string,
): string | undefined {
  return currentPayeeId ?? dependencies.findPayeeIdByName(payeeName);
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

function cloneSplitLines(splitLines: RegisterTransactionView["splitLines"]): RegisterTransactionView["splitLines"] {
  return splitLines?.map((line) => ({ ...line }));
}
