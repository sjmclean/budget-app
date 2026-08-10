export type ScheduledRecurrenceUnit = "day" | "week" | "month" | "year";

export type ScheduledMonthDayPolicy =
  | "same-day-number"
  | "last-day-of-month";

export interface AdvanceScheduledDateOptions {
  readonly anchorDay?: number;
  readonly monthDayPolicy?: ScheduledMonthDayPolicy;
}

export function advanceScheduledDate(
  date: string,
  interval: number,
  unit: ScheduledRecurrenceUnit,
  options: AdvanceScheduledDateOptions = {},
): string {
  const { year, month, day } = parseCalendarDate(date);
  const safeInterval = normaliseInterval(interval);

  if (unit === "month" || unit === "year") {
    const monthOffset = unit === "month" ? safeInterval : safeInterval * 12;
    const targetMonthIndex = year * 12 + month - 1 + monthOffset;
    const targetYear = Math.floor(targetMonthIndex / 12);
    const targetMonth = modulo(targetMonthIndex, 12) + 1;
    const lastDay = daysInMonth(targetYear, targetMonth);
    const anchorDay = normaliseAnchorDay(options.anchorDay, day);
    const targetDay = options.monthDayPolicy === "last-day-of-month"
      ? lastDay
      : Math.min(anchorDay, lastDay);
    return formatCalendarDate(targetYear, targetMonth, targetDay);
  }

  const days = unit === "week" ? safeInterval * 7 : safeInterval;
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return formatCalendarDate(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate(),
  );
}

function parseCalendarDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid scheduled transaction date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    month < 1 || month > 12 || day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new Error(`Invalid scheduled transaction date: ${value}`);
  }
  return { year, month, day };
}

function normaliseInterval(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function normaliseAnchorDay(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(31, Math.max(1, value!));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function formatCalendarDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
