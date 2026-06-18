import { ScheduledFrequency } from "../../../types/src/ScheduledFrequency.js";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function advanceScheduledTransactionDate(
  dueDate: string,
  frequency: ScheduledFrequency,
): string | null {
  if (frequency === ScheduledFrequency.Once) return null;

  const date = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid scheduled transaction date: ${dueDate}`);

  switch (frequency) {
    case ScheduledFrequency.Weekly:
      return formatDate(addDays(date, 7));
    case ScheduledFrequency.Fortnightly:
      return formatDate(addDays(date, 14));
    case ScheduledFrequency.Monthly:
      return formatDate(addMonths(date, 1));
    case ScheduledFrequency.Quarterly:
      return formatDate(addMonths(date, 3));
    case ScheduledFrequency.Yearly:
      return formatDate(addMonths(date, 12));
    default:
      return null;
  }
}
