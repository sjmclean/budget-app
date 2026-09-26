import { addBudgetMonths } from "./incomeBudgetMonth";
import type { NewRegisterTransactionInput } from "./accountRegisterTypes";
import type { ScheduledTransactionView } from "./scheduledTransactionTypes";

function normaliseTagIds(tagIds: readonly string[] | undefined): string[] {
  return [...new Set((tagIds ?? []).filter(Boolean))];
}

function cloneSplitLines(
  splitLines: ScheduledTransactionView["splitLines"],
  occurrenceDate: string,
): NewRegisterTransactionInput["splitLines"] {
  return splitLines?.map((line) => {
    const { incomeBudgetMonthOffset, ...rest } = line;
    return {
      ...rest,
      incomeBudgetMonth:
        incomeBudgetMonthOffset === undefined
          ? undefined
          : addBudgetMonths(occurrenceDate.slice(0, 7), incomeBudgetMonthOffset),
    };
  });
}

function cloneScheduledAttachments(
  attachments: ScheduledTransactionView["attachments"],
): ScheduledTransactionView["attachments"] {
  return attachments?.map((attachment) => ({ ...attachment }));
}

export function scheduledTransactionToRegisterInput(
  transaction: ScheduledTransactionView,
): NewRegisterTransactionInput {
  return {
    date: transaction.nextDueDate,
    tagIds: normaliseTagIds(transaction.tagIds),
    payee: transaction.payee,
    payeeId: transaction.payeeId,
    transferAccountId: transaction.transferAccountId,
    category: transaction.category,
    categoryId: transaction.categoryId,
    incomeBudgetMonth:
      transaction.incomeBudgetMonthOffset === undefined
        ? undefined
        : addBudgetMonths(
            transaction.nextDueDate.slice(0, 7),
            transaction.incomeBudgetMonthOffset,
          ),
    inflowClassification: transaction.inflowClassification,
    memo: transaction.memo,
    outflow: transaction.outflow,
    inflow: transaction.inflow,
    splitLines: cloneSplitLines(transaction.splitLines, transaction.nextDueDate),
    generatedFromSchedule: true,
    scheduledTransactionId: transaction.id,
    scheduledOccurrenceDate:
      transaction.recurrenceAnchorDate ?? transaction.nextDueDate,
    scheduledAttachments:
      cloneScheduledAttachments(transaction.attachments),
  };
}
