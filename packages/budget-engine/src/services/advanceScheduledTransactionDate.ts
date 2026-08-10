import { ScheduledFrequency } from "../../../types/src/ScheduledFrequency.js";
import { advanceScheduledDate } from "./scheduledRecurrence.js";

export function advanceScheduledTransactionDate(dueDate: string, frequency: ScheduledFrequency): string | null {
  if (frequency === ScheduledFrequency.Once) return null;

  switch (frequency) {
    case ScheduledFrequency.Weekly:
      return advanceScheduledDate(dueDate, 1, "week");
    case ScheduledFrequency.Fortnightly:
      return advanceScheduledDate(dueDate, 2, "week");
    case ScheduledFrequency.Monthly:
      return advanceScheduledDate(dueDate, 1, "month");
    case ScheduledFrequency.Quarterly:
      return advanceScheduledDate(dueDate, 3, "month");
    case ScheduledFrequency.Yearly:
      return advanceScheduledDate(dueDate, 1, "year");
    default:
      return null;
  }
}
