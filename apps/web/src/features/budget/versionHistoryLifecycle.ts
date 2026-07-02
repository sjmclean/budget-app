import { SELECTED_BUDGET_STORAGE_KEY, getBudgetScopedStorageKey } from "./budgetDataScope";
import {
  createVersionHistorySnapshot,
  createVersionHistorySnapshotForBudget,
  type CreateVersionHistorySnapshotResult,
} from "./versionHistory";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const VERSION_HISTORY_LIFECYCLE_RELEASE = "v2.48.0";

export type VersionHistoryLifecycleEvent =
  | "budget-switch"
  | "ynab4-import-completed"
  | "actual-import-completed"
  | "budget-import-start"
  | "budget-reset"
  | "budget-delete"
  | "daily-app-open";

export interface VersionHistoryLifecycleSnapshotResult extends CreateVersionHistorySnapshotResult {
  event: VersionHistoryLifecycleEvent;
  skippedReason?: string;
}

export interface VersionHistoryLifecycleSnapshotInput {
  now?: Date;
  description?: string;
}

const DAILY_SNAPSHOT_LOGICAL_KEY = "budget-app.version-history-daily-marker.v1";

function skipped(
  event: VersionHistoryLifecycleEvent,
  reason: string,
): VersionHistoryLifecycleSnapshotResult {
  return {
    event,
    created: false,
    retainedSnapshots: 0,
    prunedSnapshots: [],
    warnings: [],
    errors: [],
    skippedReason: reason,
  };
}

function failed(
  event: VersionHistoryLifecycleEvent,
  error: unknown,
): VersionHistoryLifecycleSnapshotResult {
  return {
    event,
    created: false,
    retainedSnapshots: 0,
    prunedSnapshots: [],
    warnings: [],
    errors: [
      error instanceof Error
        ? error.message
        : "Version history lifecycle snapshot could not be created.",
    ],
  };
}

function descriptionForEvent(event: VersionHistoryLifecycleEvent, description?: string): string {
  if (description?.trim()) {
    return description.trim();
  }

  switch (event) {
    case "budget-switch":
      return "Automatic restore point before switching budgets.";
    case "ynab4-import-completed":
      return "Automatic restore point after YNAB4 import.";
    case "actual-import-completed":
      return "Automatic restore point after Actual Budget import.";
    case "budget-import-start":
      return "Automatic restore point before budget import.";
    case "budget-reset":
      return "Automatic restore point before resetting budget.";
    case "budget-delete":
      return "Automatic restore point before deleting budget.";
    case "daily-app-open":
      return "Daily automatic restore point.";
  }
}

function createAutomaticLifecycleSnapshot(
  storage: KeyValueStoragePort,
  event: VersionHistoryLifecycleEvent,
  input: VersionHistoryLifecycleSnapshotInput,
): VersionHistoryLifecycleSnapshotResult {
  try {
    return {
      event,
      ...createVersionHistorySnapshot(storage, {
        source: "automatic",
        description: descriptionForEvent(event, input.description),
        now: input.now,
      }),
    };
  } catch (error) {
    return failed(event, error);
  }
}

function createAutomaticLifecycleSnapshotForBudget(
  storage: KeyValueStoragePort,
  budgetId: string,
  event: VersionHistoryLifecycleEvent,
  input: VersionHistoryLifecycleSnapshotInput,
): VersionHistoryLifecycleSnapshotResult {
  try {
    return {
      event,
      ...createVersionHistorySnapshotForBudget(storage, budgetId, {
        source: "automatic",
        description: descriptionForEvent(event, input.description),
        now: input.now,
      }),
    };
  } catch (error) {
    return failed(event, error);
  }
}

export function createVersionHistorySnapshotBeforeBudgetSwitch(
  storage: KeyValueStoragePort,
  nextBudgetId: string,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  const currentBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  const targetBudgetId = nextBudgetId.trim();

  if (!currentBudgetId) {
    return skipped("budget-switch", "No currently selected budget is available to snapshot.");
  }

  if (!targetBudgetId) {
    return skipped("budget-switch", "No target budget was provided.");
  }

  if (currentBudgetId === targetBudgetId) {
    return skipped("budget-switch", "The selected budget is already active.");
  }

  return createAutomaticLifecycleSnapshot(storage, "budget-switch", input);
}

export function createVersionHistorySnapshotBeforeBudgetImport(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  const currentBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;

  if (!currentBudgetId) {
    return skipped("budget-import-start", "No currently selected budget is available to snapshot before import.");
  }

  return createAutomaticLifecycleSnapshot(storage, "budget-import-start", input);
}

export function createVersionHistorySnapshotAfterYnab4Import(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  return createAutomaticLifecycleSnapshot(storage, "ynab4-import-completed", input);
}

export function createVersionHistorySnapshotAfterActualImport(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  return createAutomaticLifecycleSnapshot(storage, "actual-import-completed", input);
}

export function createVersionHistorySnapshotBeforeBudgetReset(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  return createAutomaticLifecycleSnapshot(storage, "budget-reset", input);
}

export function createVersionHistorySnapshotBeforeBudgetDelete(
  storage: KeyValueStoragePort,
  budgetId: string,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  const targetBudgetId = budgetId.trim();

  if (!targetBudgetId) {
    return skipped("budget-delete", "No budget was provided for the delete safety restore point.");
  }

  return createAutomaticLifecycleSnapshotForBudget(storage, targetBudgetId, "budget-delete", input);
}

export function createDailyVersionHistorySnapshotOnAppOpen(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  const currentBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  if (!currentBudgetId) {
    return skipped("daily-app-open", "No currently selected budget is available for a daily restore point.");
  }

  const markerKey = getBudgetScopedStorageKey(currentBudgetId, DAILY_SNAPSHOT_LOGICAL_KEY);
  const previousMarker = storage.getItem(markerKey);

  if (previousMarker === today) {
    return skipped("daily-app-open", "A daily restore point already exists for this budget today.");
  }

  const result = createAutomaticLifecycleSnapshot(storage, "daily-app-open", {
    ...input,
    now,
  });

  if (result.created) {
    storage.setItem(markerKey, today);
  }

  return result;
}
