import type { NewRegisterTransactionInput, RegisterTransactionView, ScheduledAttachmentTemplate } from "./accountRegisterTypes";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { createScheduledTransactionEntityRepository, projectScheduledTransaction, replaceScheduledTransactionEntities } from "./entities/scheduledTransactionEntity.js";
import { advanceScheduledDate } from "../../../../../packages/budget-engine/src/services/scheduledRecurrence";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { localCalendarDate } from "../dates/localCalendarDate";


import type {
  ScheduledEndCondition,
  ScheduledFrequency,
  ScheduledMonthDayPolicy,
  ScheduledRecurrenceKind,
  ScheduledRecurrenceUnit,
  ScheduledInstalment,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
  UpsertScheduledTransactionInput,
} from "./scheduledTransactionTypes";

export type {
  ScheduledEndCondition,
  ScheduledFrequency,
  ScheduledMonthDayPolicy,
  ScheduledRecurrenceKind,
  ScheduledRecurrenceUnit,
  ScheduledInstalment,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
  UpsertScheduledTransactionInput,
} from "./scheduledTransactionTypes";

import { scheduledTransactionToRegisterInput } from "./scheduledTransactionToRegisterInput";


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
    const today = localCalendarDate();
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
    const specificInstalments = normaliseSpecificInstalments(input.specificInstalments, input.specificDates, input.outflow, input.inflow);
    const specificDates = specificInstalments.map(({ date }) => date);
    const recurrenceKind = input.recurrenceKind === "specific-dates" ? "specific-dates" : "rule";
    if (recurrenceKind === "specific-dates" && specificDates.length === 0) {
      throw new Error("A specific-date schedule requires at least one occurrence date.");
    }
    const specificDateIndex = recurrenceKind === "specific-dates"
      ? normaliseSpecificDateIndex(input.specificDateIndex, specificDates)
      : 0;
    const currentAnchor = recurrenceKind === "specific-dates"
      ? specificDates[specificDateIndex]
      : input.recurrenceAnchorDate ?? input.nextDueDate;
    const occurrence = resolveOccurrenceDate(
      currentAnchor,
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
      recurrenceKind,
      specificDates: recurrenceKind === "specific-dates" ? specificDates : undefined,
      specificDateIndex: recurrenceKind === "specific-dates" ? specificDateIndex : undefined,
      specificInstalments: recurrenceKind === "specific-dates" ? specificInstalments : undefined,
      attachments: cloneScheduledAttachments(input.attachments),
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
      recurrenceAnchorDate: occurrence.anchorDate,
      recurrenceAnchorDay: normaliseRecurrenceAnchorDay(
        input.recurrenceAnchorDay,
        currentAnchor,
      ),
      monthDayPolicy: input.monthDayPolicy ?? "same-day-number",
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
      outflow: recurrenceKind === "specific-dates" ? specificInstalments[specificDateIndex]!.outflow : input.outflow,
      inflow: recurrenceKind === "specific-dates" ? specificInstalments[specificDateIndex]!.inflow : input.inflow,
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
      const recurrenceKind: ScheduledRecurrenceKind = input.recurrenceKind === "specific-dates" ? "specific-dates" : "rule";
      const specificInstalments = normaliseSpecificInstalments(input.specificInstalments, input.specificDates, input.outflow, input.inflow);
      const specificDates = specificInstalments.map(({ date }) => date);
      if (recurrenceKind === "specific-dates" && specificDates.length === 0) {
        throw new Error("A specific-date schedule requires at least one occurrence date.");
      }
      const specificDateIndex = recurrenceKind === "specific-dates"
        ? normaliseSpecificDateIndex(input.specificDateIndex, specificDates)
        : 0;
      const currentAnchor = recurrenceKind === "specific-dates"
        ? specificDates[specificDateIndex]
        : input.recurrenceAnchorDate ?? input.nextDueDate;
      const occurrence = resolveOccurrenceDate(
        currentAnchor,
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
        recurrenceKind,
        specificDates: recurrenceKind === "specific-dates" ? specificDates : undefined,
        specificDateIndex: recurrenceKind === "specific-dates" ? specificDateIndex : undefined,
        specificInstalments: recurrenceKind === "specific-dates" ? specificInstalments : undefined,
        attachments: cloneScheduledAttachments(input.attachments ?? transaction.attachments),
        recurrenceInterval: recurrence.interval,
        recurrenceUnit: recurrence.unit,
        recurrenceAnchorDate: occurrence.anchorDate,
        recurrenceAnchorDay: normaliseRecurrenceAnchorDay(
          input.recurrenceAnchorDay ?? transaction.recurrenceAnchorDay,
          currentAnchor,
        ),
        monthDayPolicy: input.monthDayPolicy ?? transaction.monthDayPolicy ?? "same-day-number",
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
        outflow: recurrenceKind === "specific-dates" ? specificInstalments[specificDateIndex]!.outflow : input.outflow,
        inflow: recurrenceKind === "specific-dates" ? specificInstalments[specificDateIndex]!.inflow : input.inflow,
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
    if (target.recurrenceKind === "specific-dates") {
      const instalments = normaliseSpecificInstalments(target.specificInstalments, target.specificDates, target.outflow, target.inflow);
      const dates = instalments.map(({ date }) => date);
      const currentIndex = normaliseSpecificDateIndex(target.specificDateIndex, dates);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= dates.length) {
        writeScheduledTransactions(
          this.dependencies.storage,
          transactions.filter((transaction) => transaction.id !== scheduledTransactionId),
        );
        return this.listByAccount(accountId);
      }
      const nextAnchor = dates[nextIndex];
      const nextDueDate = applyWeekendPolicy(nextAnchor, target.weekendPolicy ?? "same-day");
      const now = new Date().toISOString();
      writeScheduledTransactions(
        this.dependencies.storage,
        transactions.map((transaction) => transaction.id === scheduledTransactionId
          ? {
              ...transaction,
              recurrenceAnchorDate: nextAnchor,
              nextDueDate,
              specificDateIndex: nextIndex,
              specificInstalments: instalments,
              outflow: instalments[nextIndex]!.outflow,
              inflow: instalments[nextIndex]!.inflow,
              occurrencesCompleted: completed,
              updatedAt: now,
            }
          : transaction),
      );
      return this.listByAccount(accountId);
    }
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
    const candidateAnchor = advanceDateByRule(
      currentAnchor,
      recurrence.interval,
      recurrence.unit,
      {
        anchorDay: target.recurrenceAnchorDay,
        monthDayPolicy: target.monthDayPolicy,
      },
    );
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
    return scheduledTransactionToRegisterInput(transaction);
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
  if (!dependencies) return [];
  return createScheduledTransactionEntityRepository(dependencies.storage)
    .list()
    .map(projectScheduledTransaction)
    .map((transaction) => normaliseStoredScheduledTransaction(transaction, dependencies));
}

function writeScheduledTransactions(
  storage: KeyValueStoragePort,
  transactions: ScheduledTransactionView[],
): void {
  replaceScheduledTransactionEntities(
    storage,
    transactions.map((transaction) => normaliseStoredScheduledTransaction(transaction)),
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
    recurrenceKind: currentTransaction.recurrenceKind === "specific-dates" ? "specific-dates" : "rule",
    specificDates: currentTransaction.recurrenceKind === "specific-dates"
      ? normaliseSpecificDates(currentTransaction.specificDates)
      : undefined,
    specificDateIndex: currentTransaction.recurrenceKind === "specific-dates"
      ? normaliseSpecificDateIndex(currentTransaction.specificDateIndex, normaliseSpecificDates(currentTransaction.specificDates))
      : undefined,
    specificInstalments: currentTransaction.recurrenceKind === "specific-dates"
      ? normaliseSpecificInstalments(
          currentTransaction.specificInstalments,
          currentTransaction.specificDates,
          currentTransaction.outflow,
          currentTransaction.inflow,
        )
      : undefined,
    recurrenceInterval: normaliseRecurrenceInterval(currentTransaction.recurrenceInterval),
    recurrenceUnit: currentTransaction.recurrenceUnit ?? recurrenceFromFrequency(currentTransaction.frequency).unit,
    recurrenceAnchorDate: currentTransaction.recurrenceAnchorDate ?? currentTransaction.nextDueDate,
    recurrenceAnchorDay: normaliseRecurrenceAnchorDay(
      currentTransaction.recurrenceAnchorDay,
      currentTransaction.recurrenceAnchorDate ?? currentTransaction.nextDueDate,
    ),
    monthDayPolicy: currentTransaction.monthDayPolicy ?? "same-day-number",
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

export function normaliseSpecificDates(dates: readonly string[] | undefined): string[] {
  return Array.from(new Set((dates ?? []).filter(isValidCalendarDate))).sort();
}

export function normaliseSpecificInstalments(
  instalments: readonly ScheduledInstalment[] | undefined,
  legacyDates: readonly string[] | undefined,
  defaultOutflow: number,
  defaultInflow: number,
): ScheduledInstalment[] {
  const candidates = instalments?.length
    ? instalments
    : normaliseSpecificDates(legacyDates).map((date) => ({ date, outflow: defaultOutflow, inflow: defaultInflow }));
  const byDate = new Map<string, ScheduledInstalment>();
  for (const instalment of candidates) {
    if (!isValidCalendarDate(instalment.date)) continue;
    const outflow = Number.isFinite(instalment.outflow) ? Math.max(0, instalment.outflow) : 0;
    const inflow = Number.isFinite(instalment.inflow) ? Math.max(0, instalment.inflow) : 0;
    byDate.set(instalment.date, {
      date: instalment.date,
      outflow: inflow > 0 ? 0 : outflow,
      inflow,
    });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function normaliseSpecificDateIndex(index: number | undefined, dates: readonly string[]): number {
  if (dates.length === 0) return 0;
  if (!Number.isInteger(index)) return 0;
  return Math.min(dates.length - 1, Math.max(0, index!));
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    advanceScheduledDate(value, 1, "day");
    return true;
  } catch {
    return false;
  }
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
  options: {
    anchorDay?: number;
    monthDayPolicy?: ScheduledMonthDayPolicy;
  } = {},
): string {
  return advanceScheduledDate(date, interval, unit, {
    anchorDay: options.anchorDay,
    monthDayPolicy: options.monthDayPolicy,
  });
}

function normaliseRecurrenceAnchorDay(anchorDay: number | undefined, fallbackDate: string): number {
  const fallback = Number.parseInt(fallbackDate.slice(8, 10), 10);
  if (!Number.isInteger(anchorDay)) return fallback;
  return Math.min(31, Math.max(1, anchorDay!));
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
  return `scheduled-${createRuntimeUuid()}`;
}

function cloneSplitLines(splitLines: RegisterTransactionView["splitLines"]): RegisterTransactionView["splitLines"] {
  return splitLines?.map((line) => ({ ...line }));
}

function cloneScheduledAttachments(attachments: readonly ScheduledAttachmentTemplate[] | undefined): ScheduledAttachmentTemplate[] {
  return (attachments ?? []).map((attachment) => ({ ...attachment }));
}
