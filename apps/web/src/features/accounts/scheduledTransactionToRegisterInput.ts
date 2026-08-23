import type { NewRegisterTransactionInput } from "./accountRegisterTypes";
import type { ScheduledTransactionView } from "./scheduledTransactionTypes";

function normaliseTagIds(tagIds: readonly string[] | undefined): string[] {
  return [...new Set((tagIds ?? []).filter(Boolean))];
}

function cloneSplitLines(
  splitLines: ScheduledTransactionView["splitLines"],
): ScheduledTransactionView["splitLines"] {
  return splitLines?.map((line) => ({ ...line }));
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
    memo: transaction.memo,
    outflow: transaction.outflow,
    inflow: transaction.inflow,
    splitLines: cloneSplitLines(transaction.splitLines),
    generatedFromSchedule: true,
    scheduledTransactionId: transaction.id,
    scheduledOccurrenceDate:
      transaction.recurrenceAnchorDate ?? transaction.nextDueDate,
    scheduledAttachments:
      cloneScheduledAttachments(transaction.attachments),
  };
}
