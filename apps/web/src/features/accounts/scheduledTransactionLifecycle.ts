import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import {
  advanceDateByRule,
  applyWeekendPolicy,
  normaliseOccurrenceCount,
  normaliseRecurrenceAnchorDay,
  normaliseRecurrenceInterval,
  normaliseSpecificDateIndex,
  normaliseSpecificInstalments,
  recurrenceFromFrequency,
  resolveRecurrence,
} from "./scheduledTransactionRecurrence";
import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "./scheduledTransactionTypes";

export interface BuildScheduledTransactionOptions {
  existing?: ScheduledTransactionView;
  id?: string;
  now?: string;
}

export type AdvanceScheduledTransactionResult =
  | {
      action: "delete";
    }
  | {
      action: "update";
      transaction: ScheduledTransactionView;
    };

export function buildScheduledTransaction(
  input: UpsertScheduledTransactionInput,
  options: BuildScheduledTransactionOptions = {},
): ScheduledTransactionView {
  const existing = options.existing;
  const now = options.now ?? new Date().toISOString();

  const recurrenceFallback = recurrenceFromFrequency(input.frequency);

  const recurrenceInterval = normaliseRecurrenceInterval(
    input.recurrenceInterval ??
      existing?.recurrenceInterval ??
      recurrenceFallback.interval,
  );

  const recurrenceUnit =
    input.recurrenceUnit ??
    existing?.recurrenceUnit ??
    recurrenceFallback.unit;

  const recurrenceKind =
    input.recurrenceKind === "specific-dates"
      ? "specific-dates"
      : "rule";

  const specificInstalments = normaliseSpecificInstalments(
    input.specificInstalments,
    input.specificDates,
    input.outflow,
    input.inflow,
  );

  const specificDates = specificInstalments.map(({ date }) => date);

  if (
    recurrenceKind === "specific-dates" &&
    specificDates.length === 0
  ) {
    throw new Error(
      "A specific-date schedule requires at least one occurrence date.",
    );
  }

  const requestedSpecificDateIndex =
    input.specificDateIndex ??
    existing?.specificDateIndex;

  const specificDateIndex =
    recurrenceKind === "specific-dates"
      ? normaliseSpecificDateIndex(
          requestedSpecificDateIndex,
          specificDates,
        )
      : undefined;

  const currentAnchor =
    recurrenceKind === "specific-dates"
      ? specificDates[specificDateIndex!]
      : input.recurrenceAnchorDate ??
        input.nextDueDate;

  const weekendPolicy =
    input.weekendPolicy ??
    existing?.weekendPolicy ??
    "same-day";

  const category = normaliseScheduledCategory(input);

  const categoryId =
    input.categoryId ??
    (
      existing &&
      category === existing.category
        ? existing.categoryId
        : undefined
    );

  return {
    ...existing,
    ...input,

    id:
      existing?.id ??
      input.id ??
      options.id ??
      createRuntimeUuid(),

    accountId: input.accountId,

    tagIds: normaliseTagIds(input.tagIds),

    nextDueDate: applyWeekendPolicy(
      currentAnchor,
      weekendPolicy,
    ),

    frequency: input.frequency,

    recurrenceKind,

    specificDates:
      recurrenceKind === "specific-dates"
        ? specificDates
        : undefined,

    specificDateIndex,

    specificInstalments:
      recurrenceKind === "specific-dates"
        ? specificInstalments
        : undefined,

    attachments: cloneAttachments(
      input.attachments ??
        existing?.attachments,
    ),

    recurrenceInterval,
    recurrenceUnit,

    recurrenceAnchorDate: currentAnchor,

    recurrenceAnchorDay:
      normaliseRecurrenceAnchorDay(
        input.recurrenceAnchorDay ??
          existing?.recurrenceAnchorDay,
        currentAnchor,
      ),

    monthDayPolicy:
      input.monthDayPolicy ??
      existing?.monthDayPolicy ??
      "same-day-number",

    endCondition:
      input.endCondition ??
      existing?.endCondition ??
      "never",

    endDate:
      input.endDate ??
      existing?.endDate,

    occurrenceCount:
      normaliseOccurrenceCount(
        input.occurrenceCount ??
          existing?.occurrenceCount,
      ),

    occurrencesCompleted:
      input.occurrencesCompleted ??
      existing?.occurrencesCompleted ??
      0,

    weekendPolicy,

    payee: input.payee,

    payeeId:
      input.payeeId ??
      existing?.payeeId,

    category,
    categoryId,

    memo: input.memo,

    outflow:
      recurrenceKind === "specific-dates"
        ? specificInstalments[
            specificDateIndex!
          ]!.outflow
        : input.outflow,

    inflow:
      recurrenceKind === "specific-dates"
        ? specificInstalments[
            specificDateIndex!
          ]!.inflow
        : input.inflow,

    splitLines: cloneSplitLines(
      input.splitLines ??
        existing?.splitLines,
    ),

    createdAt:
      existing?.createdAt ??
      now,

    updatedAt: now,
  };
}

export function advanceScheduledTransaction(
  transaction: ScheduledTransactionView,
  now = new Date().toISOString(),
): AdvanceScheduledTransactionResult {
  const completed =
    (transaction.occurrencesCompleted ?? 0) + 1;

  if (
    transaction.recurrenceKind ===
    "specific-dates"
  ) {
    const instalments =
      normaliseSpecificInstalments(
        transaction.specificInstalments,
        transaction.specificDates,
        transaction.outflow,
        transaction.inflow,
      );

    const dates = instalments.map(
      ({ date }) => date,
    );

    const currentIndex =
      normaliseSpecificDateIndex(
        transaction.specificDateIndex,
        dates,
      );

    const nextIndex = currentIndex + 1;

    if (nextIndex >= dates.length) {
      return { action: "delete" };
    }

    const nextAnchor = dates[nextIndex]!;

    return {
      action: "update",
      transaction: {
        ...transaction,

        specificDates: dates,
        specificInstalments: instalments,
        specificDateIndex: nextIndex,

        outflow:
          instalments[nextIndex]!.outflow,

        inflow:
          instalments[nextIndex]!.inflow,

        recurrenceAnchorDate:
          nextAnchor,

        nextDueDate:
          applyWeekendPolicy(
            nextAnchor,
            transaction.weekendPolicy ??
              "same-day",
          ),

        occurrencesCompleted:
          completed,

        updatedAt: now,
      },
    };
  }

  if (
    transaction.frequency === "once" ||
    (
      transaction.endCondition ===
        "after-occurrences" &&
      completed >=
        (transaction.occurrenceCount ?? 1)
    )
  ) {
    return { action: "delete" };
  }

  const recurrence =
    resolveRecurrence(transaction);

  const currentAnchor =
    transaction.recurrenceAnchorDate ??
    transaction.nextDueDate;

  const nextAnchor =
    advanceDateByRule(
      currentAnchor,
      recurrence.interval,
      recurrence.unit,
      {
        anchorDay:
          transaction.recurrenceAnchorDay,
        monthDayPolicy:
          transaction.monthDayPolicy,
      },
    );

  if (
    transaction.endCondition === "on-date" &&
    transaction.endDate &&
    nextAnchor > transaction.endDate
  ) {
    return { action: "delete" };
  }

  return {
    action: "update",
    transaction: {
      ...transaction,

      recurrenceAnchorDate:
        nextAnchor,

      nextDueDate:
        applyWeekendPolicy(
          nextAnchor,
          transaction.weekendPolicy ??
            "same-day",
        ),

      occurrencesCompleted:
        completed,

      updatedAt: now,
    },
  };
}

function normaliseScheduledCategory(
  input: Pick<
    UpsertScheduledTransactionInput,
    "category" | "inflow" | "outflow"
  >,
): string {
  const category = input.category.trim();

  if (category) {
    return category;
  }

  return input.inflow > 0 &&
    input.outflow === 0
    ? "Ready to Assign"
    : "Uncategorised";
}

function normaliseTagIds(
  tagIds: readonly string[] | undefined,
): string[] {
  return Array.from(
    new Set(
      (tagIds ?? [])
        .map((tagId) => tagId.trim())
        .filter(Boolean),
    ),
  );
}

function cloneSplitLines(
  splitLines:
    | ScheduledTransactionView["splitLines"]
    | undefined,
): ScheduledTransactionView["splitLines"] {
  return splitLines?.map((line) => ({
    ...line,
  }));
}

function cloneAttachments(
  attachments:
    | ScheduledTransactionView["attachments"]
    | undefined,
): ScheduledTransactionView["attachments"] {
  return attachments?.map((attachment) => ({
    ...attachment,
  }));
}
