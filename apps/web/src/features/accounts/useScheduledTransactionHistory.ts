import { useCallback } from "react";
import {
  applicationHistory,
  createScheduledTransactionCommand,
  deleteScheduledTransactionCommand,
  editScheduledTransactionCommand,
  enterScheduledTransactionCommand,
  type UndoRedoResult,
} from "../history";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import type { ScheduledTransactionView, UpsertScheduledTransactionInput } from "./scheduledTransactionTypes";

function requirePerformed(result: UndoRedoResult): void {
  if (!result.performed) throw new Error(result.error ?? `Scheduled history ${result.action} failed.`);
}

function occurrenceTransactionId(accountId: string, schedule: ScheduledTransactionView): string {
  const occurrenceDate = schedule.recurrenceAnchorDate ?? schedule.nextDueDate;
  return ["scheduled", encodeURIComponent(accountId), encodeURIComponent(schedule.id), encodeURIComponent(occurrenceDate)].join(":");
}

export function useScheduledTransactionHistory(budgetId: string | null, accountId: string) {
  const execute = useCallback(async (command: Parameters<typeof applicationHistory.execute>[1]) => {
    if (!budgetId) throw new Error("Select a budget before changing scheduled transactions.");
    requirePerformed(await applicationHistory.execute(budgetId, command));
  }, [budgetId]);

  return {
    createSchedule: useCallback(async (input: UpsertScheduledTransactionInput) => {
      const scheduleId = input.id?.trim() || createRuntimeUuid();
      await execute(createScheduledTransactionCommand({ scheduleId, write: { ...input, id: scheduleId } }));
    }, [execute]),
    editSchedule: useCallback(async (input: UpsertScheduledTransactionInput & { id: string }) => {
      await execute(editScheduledTransactionCommand({ scheduleId: input.id, write: input }));
    }, [execute]),
    deleteSchedule: useCallback(async (scheduleId: string) => {
      await execute(deleteScheduledTransactionCommand(scheduleId));
    }, [execute]),
    enterSchedule: useCallback(async (schedule: ScheduledTransactionView) => {
      await execute(enterScheduledTransactionCommand({
        accountId,
        scheduleId: schedule.id,
        transactionId: occurrenceTransactionId(accountId, schedule),
      }));
    }, [accountId, execute]),
  };
}
