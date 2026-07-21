import type { NewRegisterTransactionInput, RegisterTransactionView } from "./accountRegisterTypes";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";


export type ScheduledFrequency = "once" | "daily" | "weekly" | "fortnightly" | "monthly" | "yearly" | "custom";
export type ScheduledRecurrenceUnit = "day" | "week" | "month" | "year";
export type ScheduledEndCondition = "never" | "on-date" | "after-occurrences";
export type ScheduledWeekendPolicy = "same-day" | "previous-business-day" | "next-business-day" | "skip";

export interface ScheduledTransactionView {
  id: string;
  accountId: string;
  tagIds?: string[];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  recurrenceInterval?: number;
  recurrenceUnit?: ScheduledRecurrenceUnit;
  recurrenceAnchorDate?: string;
  endCondition?: ScheduledEndCondition;
  endDate?: string;
  occurrenceCount?: number;
  occurrencesCompleted?: number;
  weekendPolicy?: ScheduledWeekendPolicy;
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
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
  tagIds?: string[];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  recurrenceInterval?: number;
  recurrenceUnit?: ScheduledRecurrenceUnit;
  recurrenceAnchorDate?: string;
  endCondition?: ScheduledEndCondition;
  endDate?: string;
  occurrenceCount?: number;
  occurrencesCompleted?: number;
  weekendPolicy?: ScheduledWeekendPolicy;
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
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
    const recurrence = {
      interval: normaliseRecurrenceInterval(input.recurrenceInterval ?? recurrenceFromFrequency(input.frequency).interval),
      unit: input.recurrenceUnit ?? recurrenceFromFrequency(input.frequency).unit,
    };
    const occurrence = resolveOccurrenceDate(
      input.recurrenceAnchorDate ?? input.nextDueDate,
      recurrence.interval,
      recurrence.unit,
      input.weekendPolicy ?? "same-day",
    );
    const now = new Date().toISOString();
    const next: ScheduledTransactionView = {
      id: createId(),
      accountId: input.accountId,
      tagIds: normaliseTagIds(input.tagIds),
      nextDueDate: occurrence.dueDate,
      frequency: input.frequency,
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
      recurrenceAnchorDate: occurrence.anchorDate,
      endCondition: input.endCondition ?? "never",
      endDate: input.endDate,
      occurrenceCount: normaliseOccurrenceCount(input.occurrenceCount),
      occurrencesCompleted: input.occurrencesCompleted ?? 0,
      weekendPolicy: input.weekendPolicy ?? "same-day",
      payee: input.payee,
      payeeId,
      category: normaliseScheduledCategory(input),
      categoryId: input.categoryId,
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

      const recurrence = {
        interval: normaliseRecurrenceInterval(input.recurrenceInterval ?? transaction.recurrenceInterval ?? recurrenceFromFrequency(input.frequency).interval),
        unit: input.recurrenceUnit ?? transaction.recurrenceUnit ?? recurrenceFromFrequency(input.frequency).unit,
      };
      const occurrence = resolveOccurrenceDate(
        input.recurrenceAnchorDate ?? input.nextDueDate,
        recurrence.interval,
        recurrence.unit,
        input.weekendPolicy ?? transaction.weekendPolicy ?? "same-day",
      );

      return {
        ...transaction,
        accountId: input.accountId,
        tagIds: normaliseTagIds(input.tagIds),
        nextDueDate: occurrence.dueDate,
        frequency: input.frequency,
        recurrenceInterval: recurrence.interval,
        recurrenceUnit: recurrence.unit,
        recurrenceAnchorDate: occurrence.anchorDate,
        endCondition: input.endCondition ?? transaction.endCondition ?? "never",
        endDate: input.endDate,
        occurrenceCount: normaliseOccurrenceCount(input.occurrenceCount ?? transaction.occurrenceCount),
        occurrencesCompleted: input.occurrencesCompleted ?? transaction.occurrencesCompleted ?? 0,
        weekendPolicy: input.weekendPolicy ?? transaction.weekendPolicy ?? "same-day",
        payee: input.payee,
        payeeId,
        category: normaliseScheduledCategory(input),
        categoryId:
          input.categoryId ??
          (normaliseScheduledCategory(input) === transaction.category
            ? transaction.categoryId
            : undefined),
        memo: input.memo,
        outflow: input.outflow,
        inflow: input.inflow,
        splitLines: cloneSplitLines(input.splitLines ?? transaction.splitLines),
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

    const completed = (target.occurrencesCompleted ?? 0) + 1;
    const shouldComplete =
      target.frequency === "once" ||
      (target.endCondition === "after-occurrences" && completed >= (target.occurrenceCount ?? 1));

    if (shouldComplete) {
      writeScheduledTransactions(
        this.dependencies.storage,
        transactions.filter((transaction) => transaction.id !== scheduledTransactionId),
      );
      return this.listByAccount(accountId);
    }

    const recurrence = resolveRecurrence(target);
    const currentAnchor = target.recurrenceAnchorDate ?? target.nextDueDate;
    const candidateAnchor = advanceDateByRule(currentAnchor, recurrence.interval, recurrence.unit);
    const occurrence = resolveOccurrenceDate(
      candidateAnchor,
      recurrence.interval,
      recurrence.unit,
      target.weekendPolicy ?? "same-day",
    );
    const nextAnchor = occurrence.anchorDate;

    if (target.endCondition === "on-date" && target.endDate && nextAnchor > target.endDate) {
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
              recurrenceAnchorDate: nextAnchor,
              nextDueDate: occurrence.dueDate,
              occurrencesCompleted: completed,
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
      tagIds: normaliseTagIds(transaction.tagIds),
      payee: transaction.payee,
      payeeId: transaction.payeeId,
      category: transaction.category,
      categoryId: transaction.categoryId,
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
  const { flag: legacyFlag, ...currentTransaction } = transaction as
    ScheduledTransactionView & { flag?: unknown };
  const legacyTagId = legacyFlagTagId(legacyFlag);

  return {
    ...currentTransaction,
    tagIds: normaliseTagIds([
      ...(currentTransaction.tagIds ?? []),
      ...(legacyTagId ? [legacyTagId] : []),
    ]),
    memo: currentTransaction.memo ?? "",
    recurrenceInterval: normaliseRecurrenceInterval(currentTransaction.recurrenceInterval),
    recurrenceUnit: currentTransaction.recurrenceUnit ?? recurrenceFromFrequency(currentTransaction.frequency).unit,
    recurrenceAnchorDate: currentTransaction.recurrenceAnchorDate ?? currentTransaction.nextDueDate,
    endCondition: currentTransaction.endCondition ?? "never",
    endDate: currentTransaction.endDate,
    occurrenceCount: normaliseOccurrenceCount(currentTransaction.occurrenceCount),
    occurrencesCompleted: currentTransaction.occurrencesCompleted ?? 0,
    weekendPolicy: currentTransaction.weekendPolicy ?? "same-day",
    payeeId:
      currentTransaction.payeeId ??
      dependencies?.findPayeeIdByName(currentTransaction.payee),
    outflow: Number.isFinite(currentTransaction.outflow)
      ? currentTransaction.outflow
      : 0,
    inflow: Number.isFinite(currentTransaction.inflow)
      ? currentTransaction.inflow
      : 0,
    splitLines: cloneSplitLines(currentTransaction.splitLines),
  };
}

function legacyFlagTagId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const colour = value.trim().toLocaleLowerCase();
  return ["red", "orange", "yellow", "green", "blue", "purple"].includes(
    colour,
  )
    ? `ynab4-imported-flag-${colour}`
    : undefined;
}

function normaliseTagIds(tagIds: readonly string[] | undefined): string[] {
  return Array.from(
    new Set((tagIds ?? []).map((tagId) => tagId.trim()).filter(Boolean)),
  );
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

export function resolveRecurrence(
  transaction: Pick<ScheduledTransactionView, "frequency" | "recurrenceInterval" | "recurrenceUnit">,
): { interval: number; unit: ScheduledRecurrenceUnit } {
  const fallback = recurrenceFromFrequency(transaction.frequency);
  return {
    interval: normaliseRecurrenceInterval(transaction.recurrenceInterval ?? fallback.interval),
    unit: transaction.recurrenceUnit ?? fallback.unit,
  };
}

export function recurrenceFromFrequency(
  frequency: ScheduledFrequency,
): { interval: number; unit: ScheduledRecurrenceUnit } {
  switch (frequency) {
    case "daily": return { interval: 1, unit: "day" };
    case "weekly": return { interval: 1, unit: "week" };
    case "fortnightly": return { interval: 2, unit: "week" };
    case "yearly": return { interval: 1, unit: "year" };
    case "once":
    case "monthly":
    case "custom":
    default:
      return { interval: 1, unit: "month" };
  }
}

export function frequencyFromRecurrence(interval: number, unit: ScheduledRecurrenceUnit): ScheduledFrequency {
  if (unit === "day" && interval === 1) return "daily";
  if (unit === "week" && interval === 1) return "weekly";
  if (unit === "week" && interval === 2) return "fortnightly";
  if (unit === "month" && interval === 1) return "monthly";
  if (unit === "year" && interval === 1) return "yearly";
  return "custom";
}

export function advanceDateByRule(
  date: string,
  interval: number,
  unit: ScheduledRecurrenceUnit,
): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  const safeInterval = normaliseRecurrenceInterval(interval);

  if (unit === "day") next.setDate(next.getDate() + safeInterval);
  if (unit === "week") next.setDate(next.getDate() + (safeInterval * 7));
  if (unit === "month") next.setMonth(next.getMonth() + safeInterval);
  if (unit === "year") next.setFullYear(next.getFullYear() + safeInterval);

  return formatIsoDate(next);
}

export function resolveOccurrenceDate(
  anchorDate: string,
  _interval: number,
  _unit: ScheduledRecurrenceUnit,
  policy: ScheduledWeekendPolicy,
): { anchorDate: string; dueDate: string } {
  return {
    anchorDate,
    dueDate: adjustOccurrenceDueDate(anchorDate, policy),
  };
}

export function shouldSkipOccurrence(
  anchorDate: string,
  policy: ScheduledWeekendPolicy,
): boolean {
  return policy === "skip" && isWeekend(anchorDate);
}

export function adjustOccurrenceDueDate(
  anchorDate: string,
  policy: ScheduledWeekendPolicy,
): string {
  const date = anchorDate;
  if (policy === "same-day") return date;

  const parsed = parseIsoDate(date);
  const day = parsed.getDay();
  if (day !== 0 && day !== 6) return date;

  if (policy === "skip") return date;

  if (policy === "previous-business-day") {
    parsed.setDate(parsed.getDate() - (day === 6 ? 1 : 2));
    return formatIsoDate(parsed);
  }

  parsed.setDate(parsed.getDate() + (day === 6 ? 2 : 1));
  return formatIsoDate(parsed);
}

/** Compatibility export for existing UI and stored schedule workflows. */
export function applyWeekendPolicy(date: string, policy: ScheduledWeekendPolicy): string {
  return adjustOccurrenceDueDate(date, policy);
}

function isWeekend(date: string): boolean {
  const day = parseIsoDate(date).getDay();
  return day === 0 || day === 6;
}

function parseIsoDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normaliseRecurrenceInterval(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value ?? 1)) : 1;
}

function normaliseOccurrenceCount(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value ?? 1)) : undefined;
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
