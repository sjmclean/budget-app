import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { ScheduledTransactionView } from "./scheduledTransactionTypes";

export const SCHEDULED_PREVIEW_DAYS_KEY = "budget-app.register.scheduled-preview-days.v1";
export const SCHEDULED_PREVIEW_DAY_OPTIONS = [3, 7, 14, 30] as const;
export const DEFAULT_SCHEDULED_PREVIEW_DAYS = 7;
export const MAX_SCHEDULED_PREVIEW_ROWS = 5;
export type ScheduledPreviewDays = typeof SCHEDULED_PREVIEW_DAY_OPTIONS[number];

export function readScheduledPreviewDays(storage: Pick<KeyValueStoragePort,"getItem">): ScheduledPreviewDays {
  const value = Number(storage.getItem(SCHEDULED_PREVIEW_DAYS_KEY));
  return SCHEDULED_PREVIEW_DAY_OPTIONS.includes(value as ScheduledPreviewDays)
    ? value as ScheduledPreviewDays : DEFAULT_SCHEDULED_PREVIEW_DAYS;
}
export function writeScheduledPreviewDays(storage: Pick<KeyValueStoragePort,"setItem">, days: ScheduledPreviewDays) {
  storage.setItem(SCHEDULED_PREVIEW_DAYS_KEY, String(days));
}
export function addLocalCalendarDays(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate()+days);
  const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}
export function buildScheduledPreview(schedules: readonly ScheduledTransactionView[], today: string, days: ScheduledPreviewDays) {
  const horizon=addLocalCalendarDays(today,days);
  const eligible=schedules.filter(item=>item.nextDueDate<=horizon).sort((a,b)=>a.nextDueDate.localeCompare(b.nextDueDate)||a.id.localeCompare(b.id));
  return {items:eligible.slice(0,MAX_SCHEDULED_PREVIEW_ROWS),total:eligible.length,scheduledTotal:schedules.length,remaining:Math.max(0,eligible.length-MAX_SCHEDULED_PREVIEW_ROWS),horizon};
}
