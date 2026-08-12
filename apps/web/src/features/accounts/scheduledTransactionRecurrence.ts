import { advanceScheduledDate } from "../../../../../packages/budget-engine/src/services/scheduledRecurrence";
import type {
  ScheduledFrequency,
  ScheduledInstalment,
  ScheduledMonthDayPolicy,
  ScheduledRecurrenceUnit,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
} from "./scheduledTransactionTypes";

export function normaliseSpecificDates(
  dates: readonly string[] | undefined,
): string[] {
  return Array.from(
    new Set((dates ?? []).filter(isValidCalendarDate)),
  ).sort();
}

export function normaliseSpecificInstalments(
  instalments: readonly ScheduledInstalment[] | undefined,
  legacyDates: readonly string[] | undefined,
  defaultOutflow: number,
  defaultInflow: number,
): ScheduledInstalment[] {
  const candidates = instalments?.length
    ? instalments
    : normaliseSpecificDates(legacyDates).map((date) => ({
        date,
        outflow: defaultOutflow,
        inflow: defaultInflow,
      }));

  const byDate = new Map<string, ScheduledInstalment>();

  for (const instalment of candidates) {
    if (!isValidCalendarDate(instalment.date)) continue;

    const outflow = Number.isFinite(instalment.outflow)
      ? Math.max(0, instalment.outflow)
      : 0;

    const inflow = Number.isFinite(instalment.inflow)
      ? Math.max(0, instalment.inflow)
      : 0;

    byDate.set(instalment.date, {
      date: instalment.date,
      outflow: inflow > 0 ? 0 : outflow,
      inflow,
    });
  }

  return [...byDate.values()].sort(
    (left, right) => left.date.localeCompare(right.date),
  );
}

export function normaliseSpecificDateIndex(
  index: number | undefined,
  dates: readonly string[],
): number {
  if (dates.length === 0) return 0;
  if (!Number.isInteger(index)) return 0;
  return Math.min(dates.length - 1, Math.max(0, index!));
}

export function resolveRecurrence(
  transaction: Pick<
    ScheduledTransactionView,
    "frequency" | "recurrenceInterval" | "recurrenceUnit"
  >,
): { interval: number; unit: ScheduledRecurrenceUnit } {
  const fallback = recurrenceFromFrequency(transaction.frequency);

  return {
    interval: normaliseRecurrenceInterval(
      transaction.recurrenceInterval ?? fallback.interval,
    ),
    unit: transaction.recurrenceUnit ?? fallback.unit,
  };
}

export function recurrenceFromFrequency(
  frequency: ScheduledFrequency,
): { interval: number; unit: ScheduledRecurrenceUnit } {
  switch (frequency) {
    case "daily":
      return { interval: 1, unit: "day" };
    case "weekly":
      return { interval: 1, unit: "week" };
    case "fortnightly":
      return { interval: 2, unit: "week" };
    case "yearly":
      return { interval: 1, unit: "year" };
    case "once":
    case "monthly":
    case "custom":
    default:
      return { interval: 1, unit: "month" };
  }
}

export function frequencyFromRecurrence(
  interval: number,
  unit: ScheduledRecurrenceUnit,
): ScheduledFrequency {
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

  if (policy === "same-day") {
    return date;
  }

  const parsed = parseIsoDate(date);
  const day = parsed.getDay();

  if (day !== 0 && day !== 6) {
    return date;
  }

  if (policy === "skip") {
    return date;
  }

  if (policy === "previous-business-day") {
    parsed.setDate(parsed.getDate() - (day === 6 ? 1 : 2));
    return formatIsoDate(parsed);
  }

  parsed.setDate(parsed.getDate() + (day === 6 ? 2 : 1));
  return formatIsoDate(parsed);
}

export function applyWeekendPolicy(
  date: string,
  policy: ScheduledWeekendPolicy,
): string {
  return adjustOccurrenceDueDate(date, policy);
}

export function normaliseRecurrenceInterval(
  value: number | undefined,
): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.floor(value ?? 1))
    : 1;
}

export function normaliseRecurrenceAnchorDay(
  anchorDay: number | undefined,
  fallbackDate: string,
): number {
  const fallback = Number.parseInt(fallbackDate.slice(8, 10), 10);

  if (!Number.isInteger(anchorDay)) {
    return fallback;
  }

  return Math.min(31, Math.max(1, anchorDay!));
}

export function normaliseOccurrenceCount(
  value: number | undefined,
): number | undefined {
  return Number.isFinite(value)
    ? Math.max(1, Math.floor(value ?? 1))
    : undefined;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  try {
    advanceScheduledDate(value, 1, "day");
    return true;
  } catch {
    return false;
  }
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
