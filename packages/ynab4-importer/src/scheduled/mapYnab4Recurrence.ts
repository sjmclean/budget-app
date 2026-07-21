export type Ynab4ScheduledFrequency =
  | "once"
  | "daily"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "yearly"
  | "custom";

export type Ynab4ScheduledRecurrenceUnit = "day" | "week" | "month" | "year";

export interface Ynab4ScheduledRecurrence {
  frequency: Ynab4ScheduledFrequency;
  interval: number;
  unit: Ynab4ScheduledRecurrenceUnit;
}

type Ynab4RecurrenceFields = {
  frequency?: unknown;
  repeat?: unknown;
  recurrence?: unknown;
};

const KNOWN_RECURRENCES: Record<string, Ynab4ScheduledRecurrence> = {
  once: { frequency: "once", interval: 1, unit: "month" },
  never: { frequency: "once", interval: 1, unit: "month" },
  daily: { frequency: "daily", interval: 1, unit: "day" },
  weekly: { frequency: "weekly", interval: 1, unit: "week" },
  fortnightly: { frequency: "fortnightly", interval: 2, unit: "week" },
  everyotherweek: { frequency: "fortnightly", interval: 2, unit: "week" },
  every4weeks: { frequency: "custom", interval: 4, unit: "week" },
  monthly: { frequency: "monthly", interval: 1, unit: "month" },
  everyothermonth: { frequency: "custom", interval: 2, unit: "month" },
  every2months: { frequency: "custom", interval: 2, unit: "month" },
  every3months: { frequency: "custom", interval: 3, unit: "month" },
  quarterly: { frequency: "custom", interval: 3, unit: "month" },
  every4months: { frequency: "custom", interval: 4, unit: "month" },
  twiceayear: { frequency: "custom", interval: 6, unit: "month" },
  halfyearly: { frequency: "custom", interval: 6, unit: "month" },
  yearly: { frequency: "yearly", interval: 1, unit: "year" },
  annually: { frequency: "yearly", interval: 1, unit: "year" },
};

/**
 * Convert a YNAB4 scheduled recurrence into the budget app's uniform
 * recurrence contract. Unsupported non-uniform rules are rejected rather
 * than silently changed.
 */
export function mapYnab4Recurrence(
  row: Ynab4RecurrenceFields,
): Ynab4ScheduledRecurrence {
  const source = firstString(row.frequency, row.repeat, row.recurrence);
  if (!source) {
    return { frequency: "monthly", interval: 1, unit: "month" };
  }

  const normalized = source.replace(/[\s_-]/g, "").toLowerCase();
  const known = KNOWN_RECURRENCES[normalized];
  if (known) return { ...known };

  const every = source.match(/^every\s+(\d+)\s+(day|week|month|year)s?$/i);
  if (every) {
    return {
      frequency: "custom",
      interval: Number.parseInt(every[1], 10),
      unit: every[2].toLowerCase() as Ynab4ScheduledRecurrenceUnit,
    };
  }

  throw new Error(`Unsupported YNAB4 scheduled frequency: ${source}.`);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}
