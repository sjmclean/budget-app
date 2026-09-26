import type {
  RegisterSplitLineView,
  ScheduledAttachmentTemplate,
} from "./accountRegisterTypes";
import type { InflowClassification } from "./incomeTransactionSemantics";

export type ScheduledFrequency =
  | "once"
  | "daily"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "yearly"
  | "custom";

export type ScheduledRecurrenceUnit =
  | "day"
  | "week"
  | "month"
  | "year";

export type ScheduledEndCondition =
  | "never"
  | "on-date"
  | "after-occurrences";

export type ScheduledWeekendPolicy =
  | "same-day"
  | "previous-business-day"
  | "next-business-day"
  | "skip";

export type ScheduledMonthDayPolicy =
  | "same-day-number"
  | "last-day-of-month";

export type ScheduledRecurrenceKind =
  | "rule"
  | "specific-dates";

export type ScheduledIncomeBudgetMonthOffset = 0 | 1;

export interface ScheduledSplitLineView
  extends Omit<RegisterSplitLineView, "incomeBudgetMonth"> {
  incomeBudgetMonthOffset?: ScheduledIncomeBudgetMonthOffset;
}

export interface ScheduledInstalment {
  date: string;
  outflow: number;
  inflow: number;
}

export interface ScheduledTransactionView {
  id: string;
  accountId: string;
  tagIds?: string[];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  recurrenceKind?: ScheduledRecurrenceKind;
  specificDates?: string[];
  specificDateIndex?: number;
  specificInstalments?: ScheduledInstalment[];
  attachments?: ScheduledAttachmentTemplate[];
  recurrenceInterval?: number;
  recurrenceUnit?: ScheduledRecurrenceUnit;
  recurrenceAnchorDate?: string;
  recurrenceAnchorDay?: number;
  monthDayPolicy?: ScheduledMonthDayPolicy;
  endCondition?: ScheduledEndCondition;
  endDate?: string;
  occurrenceCount?: number;
  occurrencesCompleted?: number;
  weekendPolicy?: ScheduledWeekendPolicy;
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
  category: string;
  categoryId?: string;
  incomeBudgetMonthOffset?: ScheduledIncomeBudgetMonthOffset;
  inflowClassification?: InflowClassification;
  memo?: string;
  outflow: number;
  inflow: number;
  splitLines?: ScheduledSplitLineView[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertScheduledTransactionInput {
  id?: string;
  accountId: string;
  tagIds?: string[];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  recurrenceKind?: ScheduledRecurrenceKind;
  specificDates?: string[];
  specificDateIndex?: number;
  specificInstalments?: ScheduledInstalment[];
  attachments?: ScheduledAttachmentTemplate[];
  recurrenceInterval?: number;
  recurrenceUnit?: ScheduledRecurrenceUnit;
  recurrenceAnchorDate?: string;
  recurrenceAnchorDay?: number;
  monthDayPolicy?: ScheduledMonthDayPolicy;
  endCondition?: ScheduledEndCondition;
  endDate?: string;
  occurrenceCount?: number;
  occurrencesCompleted?: number;
  weekendPolicy?: ScheduledWeekendPolicy;
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
  category: string;
  categoryId?: string;
  incomeBudgetMonthOffset?: ScheduledIncomeBudgetMonthOffset;
  inflowClassification?: InflowClassification;
  memo?: string;
  outflow: number;
  inflow: number;
  splitLines?: ScheduledSplitLineView[];
}
