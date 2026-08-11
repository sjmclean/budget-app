import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const BUDGET_DELETION_MARKERS_KEY = "budget-app.budget-deletions-in-progress.v1";

export function readBudgetDeletionMarkers(storage: KeyValueStoragePort): ReadonlySet<string> {
  try {
    const value = JSON.parse(storage.getItem(BUDGET_DELETION_MARKERS_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())) : []);
  } catch {
    return new Set();
  }
}

function writeMarkers(storage: KeyValueStoragePort, markers: ReadonlySet<string>): void {
  if (markers.size === 0) {
    storage.removeItem(BUDGET_DELETION_MARKERS_KEY);
    return;
  }
  storage.setItem(BUDGET_DELETION_MARKERS_KEY, JSON.stringify([...markers].sort()));
}

export function markBudgetDeletionInProgress(storage: KeyValueStoragePort, budgetId: string): void {
  const markers = new Set(readBudgetDeletionMarkers(storage));
  markers.add(budgetId);
  writeMarkers(storage, markers);
}

export function clearBudgetDeletionMarker(storage: KeyValueStoragePort, budgetId: string): void {
  const markers = new Set(readBudgetDeletionMarkers(storage));
  markers.delete(budgetId);
  writeMarkers(storage, markers);
}

export function isBudgetDeletionInProgress(storage: KeyValueStoragePort, budgetId: string): boolean {
  return readBudgetDeletionMarkers(storage).has(budgetId);
}
