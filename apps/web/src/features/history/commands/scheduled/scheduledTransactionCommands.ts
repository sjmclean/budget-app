import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../../../accounts/scheduledTransactionTypes";
import { shouldSkipOccurrence } from "../../../accounts/scheduledTransactionRecurrence";
import type { TransactionHistorySnapshot } from "../../../persistence";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

function queries(context: ApplicationHistoryContext) {
  const value = context.persistence.accountRegisterQueries;
  if (!value) throw new Error("Scheduled history requires authoritative SQLite persistence.");
  return value;
}

async function replaceSchedule(
  context: ApplicationHistoryContext,
  scheduleId: string,
  expectedSchedule: ScheduledTransactionView | null,
  replacementSchedule: ScheduledTransactionView | null,
  expectedTransaction: TransactionHistorySnapshot | null = null,
  replacementTransaction: TransactionHistorySnapshot | null = null,
) {
  await queries(context).replaceScheduledTransactionHistoryState({
    budgetId: context.budgetId,
    scheduleId,
    expectedSchedule,
    replacementSchedule,
    expectedTransaction,
    replacementTransaction,
  });
}

export function createScheduledTransactionCommand(input: {
  readonly scheduleId: string;
  readonly write: UpsertScheduledTransactionInput;
}): UndoableCommand<ApplicationHistoryContext> {
  let after: ScheduledTransactionView | null = null;
  return {
    id: `create-scheduled-transaction:${input.scheduleId}`,
    label: "Create scheduled transaction",
    async execute(context) {
      queries(context);
      await context.persistence.scheduledTransactions.create({ ...input.write, id: input.scheduleId });
      after = await queries(context).captureScheduledTransaction(context.budgetId, input.scheduleId);
      if (!after) throw new Error("Created scheduled transaction could not be recaptured.");
    },
    async undo(context) {
      if (!after) throw new Error("Create schedule command has no captured state.");
      await replaceSchedule(context, input.scheduleId, after, null);
    },
    async redo(context) {
      if (!after) throw new Error("Create schedule command has no captured state.");
      await replaceSchedule(context, input.scheduleId, null, after);
    },
  };
}

export function editScheduledTransactionCommand(input: {
  readonly scheduleId: string;
  readonly write: UpsertScheduledTransactionInput;
}): UndoableCommand<ApplicationHistoryContext> {
  let before: ScheduledTransactionView | null = null;
  let after: ScheduledTransactionView | null = null;
  return {
    id: `edit-scheduled-transaction:${input.scheduleId}:${Date.now()}`,
    label: "Edit scheduled transaction",
    async execute(context) {
      before = await queries(context).captureScheduledTransaction(context.budgetId, input.scheduleId);
      if (!before) throw new Error("Scheduled transaction was not found.");
      await context.persistence.scheduledTransactions.update({ ...input.write, id: input.scheduleId });
      after = await queries(context).captureScheduledTransaction(context.budgetId, input.scheduleId);
      if (!after) throw new Error("Edited scheduled transaction could not be recaptured.");
    },
    async undo(context) {
      if (!before || !after) throw new Error("Edit schedule command has incomplete state.");
      await replaceSchedule(context, input.scheduleId, after, before);
    },
    async redo(context) {
      if (!before || !after) throw new Error("Edit schedule command has incomplete state.");
      await replaceSchedule(context, input.scheduleId, before, after);
    },
  };
}

export function deleteScheduledTransactionCommand(
  scheduleId: string,
): UndoableCommand<ApplicationHistoryContext> {
  let before: ScheduledTransactionView | null = null;
  return {
    id: `delete-scheduled-transaction:${scheduleId}:${Date.now()}`,
    label: "Delete scheduled transaction",
    async execute(context) {
      before = await queries(context).captureScheduledTransaction(context.budgetId, scheduleId);
      if (!before) throw new Error("Scheduled transaction was not found.");
      await replaceSchedule(context, scheduleId, before, null);
    },
    async undo(context) {
      if (!before) throw new Error("Delete schedule command has no captured state.");
      await replaceSchedule(context, scheduleId, null, before);
    },
    async redo(context) {
      if (!before) throw new Error("Delete schedule command has no captured state.");
      await replaceSchedule(context, scheduleId, before, null);
    },
  };
}

export function enterScheduledTransactionCommand(input: {
  readonly accountId: string;
  readonly scheduleId: string;
  readonly transactionId: string;
}): UndoableCommand<ApplicationHistoryContext> {
  let beforeSchedule: ScheduledTransactionView | null = null;
  let afterSchedule: ScheduledTransactionView | null = null;
  let transaction: TransactionHistorySnapshot | null = null;
  return {
    id: `enter-scheduled-transaction:${input.scheduleId}:${input.transactionId}`,
    label: "Enter scheduled transaction",
    async execute(context) {
      beforeSchedule = await queries(context).captureScheduledTransaction(context.budgetId, input.scheduleId);
      if (!beforeSchedule) throw new Error("Scheduled transaction was not found.");
      const anchor = beforeSchedule.recurrenceAnchorDate ?? beforeSchedule.nextDueDate;
      const result = await queries(context).enterScheduledTransaction({
        budgetId: context.budgetId,
        accountId: input.accountId,
        schedule: beforeSchedule,
        transactionId: input.transactionId,
        createTransaction: !shouldSkipOccurrence(anchor, beforeSchedule.weekendPolicy ?? "same-day"),
      });
      afterSchedule = result.afterSchedule;
      transaction = result.transaction;
    },
    async undo(context) {
      if (!beforeSchedule) throw new Error("Enter schedule command has no captured state.");
      await replaceSchedule(context, input.scheduleId, afterSchedule, beforeSchedule, transaction, null);
    },
    async redo(context) {
      if (!beforeSchedule) throw new Error("Enter schedule command has no captured state.");
      await replaceSchedule(context, input.scheduleId, beforeSchedule, afterSchedule, null, transaction);
    },
  };
}
