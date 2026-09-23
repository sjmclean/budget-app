import type { AccountTransactionRow } from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { normaliseMerchant } from "./merchantNormalisation";
import { advanceDateByRule } from "./scheduledTransactionRecurrence";
import type { ScheduledRecurrenceUnit, ScheduledTransactionView } from "./scheduledTransactionTypes";

export const SCHEDULED_TRANSACTION_DISCOVERY_LOOKBACK_MONTHS = 18;

export interface ScheduledTransactionDiscoveryRecord {
  id: string;
  date: string;
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
  amount: number;
  transferAccountId?: string;
  generatedFromSchedule?: boolean;
  scheduledTransactionId?: string;
  splitLineCount: number;
}

export interface ScheduledTransactionSuggestion {
  id: string;
  fingerprint: string;
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
  direction: "outflow" | "inflow";
  recurrenceInterval: number;
  recurrenceUnit: ScheduledRecurrenceUnit;
  recurrenceLabel: string;
  nextDueDate: string;
  recurrenceAnchorDay?: number;
  amount: {
    kind: "fixed" | "variable";
    suggested: number;
    min: number;
    max: number;
  };
  evidence: {
    transactionIds: string[];
    dates: string[];
    occurrenceCount: number;
    firstSeen: string;
    lastSeen: string;
  };
  confidence: "high" | "possible";
  requiresReview: boolean;
}

interface RecurrenceDefinition {
  interval: number;
  unit: ScheduledRecurrenceUnit;
  label: string;
  minimumOccurrences: number;
  toleranceDays: number;
}

const RECURRENCES: readonly RecurrenceDefinition[] = [
  { interval: 1, unit: "week", label: "Weekly", minimumOccurrences: 4, toleranceDays: 2 },
  { interval: 2, unit: "week", label: "Fortnightly", minimumOccurrences: 4, toleranceDays: 3 },
  { interval: 1, unit: "month", label: "Monthly", minimumOccurrences: 3, toleranceDays: 4 },
  { interval: 3, unit: "month", label: "Quarterly", minimumOccurrences: 3, toleranceDays: 7 },
  { interval: 6, unit: "month", label: "Half-yearly", minimumOccurrences: 3, toleranceDays: 10 },
  { interval: 1, unit: "year", label: "Yearly", minimumOccurrences: 2, toleranceDays: 14 },
];

export function scheduledTransactionDiscoveryStartDate(asOfDate: string): string {
  const date = parseDate(asOfDate);
  date.setUTCMonth(date.getUTCMonth() - SCHEDULED_TRANSACTION_DISCOVERY_LOOKBACK_MONTHS);
  return formatDate(date);
}

export function discoveryRecordFromRegisterTransaction(
  transaction: RegisterTransactionView,
): ScheduledTransactionDiscoveryRecord {
  return {
    id: transaction.id,
    date: transaction.date,
    payee: transaction.payee,
    payeeId: transaction.payeeId,
    category: transaction.category,
    categoryId: transaction.categoryId,
    amount: transaction.inflow - transaction.outflow,
    transferAccountId: transaction.transferAccountId,
    generatedFromSchedule: transaction.generatedFromSchedule,
    scheduledTransactionId: transaction.scheduledTransactionId,
    splitLineCount: transaction.splitLines?.length ?? 0,
  };
}

export function discoveryRecordFromAccountTransactionRow(
  row: AccountTransactionRow,
): ScheduledTransactionDiscoveryRecord {
  return {
    id: row.id,
    date: row.date,
    payee: row.payeeName ?? "",
    payeeId: row.payeeId ?? undefined,
    category: row.categoryName ?? "",
    categoryId: row.categoryId ?? undefined,
    amount: row.amount / 100,
    transferAccountId: row.transferAccountId ?? undefined,
    generatedFromSchedule: row.generatedFromSchedule,
    scheduledTransactionId: row.scheduledTransactionId ?? undefined,
    splitLineCount: row.splitLines.length,
  };
}

export function discoverScheduledTransactions(input: {
  transactions: readonly ScheduledTransactionDiscoveryRecord[];
  existingSchedules: readonly ScheduledTransactionView[];
  asOfDate: string;
  ignoredFingerprints?: ReadonlySet<string>;
}): ScheduledTransactionSuggestion[] {
  const startDate = scheduledTransactionDiscoveryStartDate(input.asOfDate);
  const groups = new Map<string, ScheduledTransactionDiscoveryRecord[]>();

  for (const transaction of input.transactions) {
    if (
      transaction.date < startDate ||
      transaction.date > input.asOfDate ||
      transaction.amount === 0 ||
      transaction.generatedFromSchedule ||
      transaction.scheduledTransactionId ||
      transaction.transferAccountId ||
      transaction.payee.trim().length === 0 ||
      transaction.splitLineCount > 0
    ) {
      continue;
    }

    const direction = transaction.amount > 0 ? "inflow" : "outflow";
    const merchantKey = merchantIdentity(transaction);
    if (!merchantKey) continue;
    const key = `${merchantKey}|${direction}`;
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const suggestions: ScheduledTransactionSuggestion[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const recurrence = selectRecurrence(sorted);
    if (!recurrence) continue;

    const representative = sorted.at(-1)!;
    const direction = representative.amount > 0 ? "inflow" : "outflow";
    const fingerprint = buildScheduledTransactionSuggestionFingerprint({
      payeeId: representative.payeeId,
      payee: representative.payee,
      direction,
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
    });

    if (input.ignoredFingerprints?.has(fingerprint)) continue;
    if (matchesExistingSchedule(representative, direction, recurrence, input.existingSchedules)) continue;

    const amounts = sorted.map((transaction) => Math.abs(transaction.amount));
    const amount = analyseAmount(amounts);
    const category = analyseCategory(sorted);
    const lastDate = sorted.at(-1)!.date;
    const nextDueDate = advanceToFuture(lastDate, recurrence, input.asOfDate);
    const yearly = recurrence.unit === "year";
    const intervalFit = recurrenceFit(sorted, recurrence);
    const highConfidence =
      !yearly &&
      intervalFit >= 0.8 &&
      amount.kind === "fixed" &&
      Boolean(representative.payeeId || normaliseMerchant(representative.payee).canonical);

    suggestions.push({
      id: `scheduled-discovery:${fingerprint}`,
      fingerprint,
      payee: representative.payee,
      payeeId: representative.payeeId,
      category: category.name,
      categoryId: category.id,
      direction,
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
      recurrenceLabel: recurrence.label,
      nextDueDate,
      recurrenceAnchorDay:
        recurrence.unit === "month" || recurrence.unit === "year"
          ? median(sorted.map((transaction) => Number(transaction.date.slice(8, 10))))
          : undefined,
      amount,
      evidence: {
        transactionIds: sorted.map((transaction) => transaction.id),
        dates: sorted.map((transaction) => transaction.date),
        occurrenceCount: sorted.length,
        firstSeen: sorted[0]!.date,
        lastSeen: lastDate,
      },
      confidence: highConfidence ? "high" : "possible",
      requiresReview: !highConfidence || amount.kind === "variable" || !category.name,
    });
  }

  return suggestions.sort((left, right) => {
    if (left.confidence !== right.confidence) return left.confidence === "high" ? -1 : 1;
    if (left.evidence.occurrenceCount !== right.evidence.occurrenceCount) {
      return right.evidence.occurrenceCount - left.evidence.occurrenceCount;
    }
    return left.payee.localeCompare(right.payee);
  });
}

export function buildScheduledTransactionSuggestionFingerprint(input: {
  payeeId?: string;
  payee: string;
  direction: "outflow" | "inflow";
  recurrenceInterval: number;
  recurrenceUnit: ScheduledRecurrenceUnit;
}): string {
  const identity = input.payeeId?.trim()
    ? `payee:${input.payeeId.trim()}`
    : `merchant:${normaliseMerchant(input.payee).canonical || input.payee.trim().toLowerCase()}`;
  return `${identity}|${input.direction}|${input.recurrenceInterval}:${input.recurrenceUnit}`;
}

function merchantIdentity(transaction: ScheduledTransactionDiscoveryRecord): string | null {
  if (transaction.payeeId?.trim()) return `payee:${transaction.payeeId.trim()}`;
  const merchant = normaliseMerchant(transaction.payee).canonical;
  return merchant ? `merchant:${merchant}` : null;
}

function selectRecurrence(
  transactions: readonly ScheduledTransactionDiscoveryRecord[],
): RecurrenceDefinition | null {
  let winner: { definition: RecurrenceDefinition; fit: number } | null = null;
  for (const definition of RECURRENCES) {
    if (transactions.length < definition.minimumOccurrences) continue;
    const fit = recurrenceFit(transactions, definition);
    const threshold = transactions.length === definition.minimumOccurrences ? 0.75 : 0.65;
    if (fit < threshold) continue;
    if (!winner || fit > winner.fit) winner = { definition, fit };
  }
  return winner?.definition ?? null;
}

function recurrenceFit(
  transactions: readonly ScheduledTransactionDiscoveryRecord[],
  recurrence: Pick<RecurrenceDefinition, "interval" | "unit" | "toleranceDays">,
): number {
  if (transactions.length < 2) return 0;
  let matches = 0;
  for (let index = 1; index < transactions.length; index += 1) {
    const previous = transactions[index - 1]!.date;
    const current = transactions[index]!.date;
    if (matchesExpectedInterval(previous, current, recurrence)) matches += 1;
    else if (matchesMissedOccurrence(previous, current, recurrence)) matches += 0.75;
  }
  return matches / (transactions.length - 1);
}

function matchesExpectedInterval(
  previous: string,
  current: string,
  recurrence: Pick<RecurrenceDefinition, "interval" | "unit" | "toleranceDays">,
): boolean {
  const expected = advanceDateByRule(previous, recurrence.interval, recurrence.unit, {
    anchorDay: Number(previous.slice(8, 10)),
  });
  return Math.abs(dayDifference(expected, current)) <= recurrence.toleranceDays;
}

function matchesMissedOccurrence(
  previous: string,
  current: string,
  recurrence: Pick<RecurrenceDefinition, "interval" | "unit" | "toleranceDays">,
): boolean {
  const expectedTwice = advanceDateByRule(previous, recurrence.interval * 2, recurrence.unit, {
    anchorDay: Number(previous.slice(8, 10)),
  });
  return Math.abs(dayDifference(expectedTwice, current)) <= recurrence.toleranceDays;
}

function analyseAmount(amounts: readonly number[]): ScheduledTransactionSuggestion["amount"] {
  const sorted = [...amounts].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted.at(-1) ?? 0;
  const typical = median(sorted);
  const fixedTolerance = Math.max(1, typical * 0.02);
  const fixed = max - min <= fixedTolerance;
  return {
    kind: fixed ? "fixed" : "variable",
    suggested: fixed ? amounts.at(-1) ?? typical : typical,
    min,
    max,
  };
}

function analyseCategory(
  transactions: readonly ScheduledTransactionDiscoveryRecord[],
): { name: string; id?: string } {
  const counts = new Map<string, { count: number; name: string; id?: string }>();
  for (const transaction of transactions) {
    const name = transaction.category.trim();
    if (!name) continue;
    const key = transaction.categoryId?.trim() || name.toLowerCase();
    const current = counts.get(key) ?? { count: 0, name, id: transaction.categoryId };
    current.count += 1;
    counts.set(key, current);
  }
  const winner = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner || winner.count / transactions.length < 0.75) return { name: "" };
  return { name: winner.name, id: winner.id };
}

function matchesExistingSchedule(
  transaction: ScheduledTransactionDiscoveryRecord,
  direction: "outflow" | "inflow",
  recurrence: RecurrenceDefinition,
  schedules: readonly ScheduledTransactionView[],
): boolean {
  const transactionMerchant = normaliseMerchant(transaction.payee).canonical;
  return schedules.some((schedule) => {
    const scheduleDirection = schedule.inflow > 0 ? "inflow" : "outflow";
    if (scheduleDirection !== direction) return false;
    const samePayee = transaction.payeeId && schedule.payeeId
      ? transaction.payeeId === schedule.payeeId
      : normaliseMerchant(schedule.payee).canonical === transactionMerchant;
    if (!samePayee) return false;
    const scheduleUnit = schedule.recurrenceUnit ??
      (schedule.frequency === "weekly" ? "week" :
       schedule.frequency === "fortnightly" ? "week" :
       schedule.frequency === "yearly" ? "year" : "month");
    const scheduleInterval = schedule.recurrenceInterval ??
      (schedule.frequency === "fortnightly" ? 2 : 1);
    return scheduleUnit === recurrence.unit && scheduleInterval === recurrence.interval;
  });
}

function advanceToFuture(
  lastDate: string,
  recurrence: Pick<RecurrenceDefinition, "interval" | "unit">,
  asOfDate: string,
): string {
  let next = advanceDateByRule(lastDate, recurrence.interval, recurrence.unit, {
    anchorDay: Number(lastDate.slice(8, 10)),
  });
  let guard = 0;
  while (next < asOfDate && guard < 100) {
    next = advanceDateByRule(next, recurrence.interval, recurrence.unit, {
      anchorDay: Number(lastDate.slice(8, 10)),
    });
    guard += 1;
  }
  return next;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function dayDifference(left: string, right: string): number {
  return Math.round((parseDate(right).getTime() - parseDate(left).getTime()) / 86_400_000);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
