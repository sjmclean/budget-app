import { SELECTED_BUDGET_STORAGE_KEY, getBudgetScopedStorageKey } from "./budgetDataScope";
import {
  createVersionHistorySnapshot,
  createVersionHistorySnapshotForBudget,
  type VersionHistoryCheckpointReason,
  type CreateVersionHistorySnapshotResult,
} from "./versionHistory";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const VERSION_HISTORY_LIFECYCLE_RELEASE = "v2.48.0";

export type VersionHistoryLifecycleEvent =
  | "timed-dirty-budget-checkpoint"
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
  changedAreas?: string[];
  approximateChanges?: string;
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
    case "timed-dirty-budget-checkpoint":
      return "Timed automatic restore point for unsaved budget changes.";
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

function reasonForEvent(event: VersionHistoryLifecycleEvent): VersionHistoryCheckpointReason {
  switch (event) {
    case "timed-dirty-budget-checkpoint":
      return "timed-dirty-budget-checkpoint";
    case "budget-switch":
      return "before-budget-switch";
    case "ynab4-import-completed":
    case "actual-import-completed":
      return "after-import";
    case "budget-import-start":
      return "before-import";
    case "budget-reset":
      return "before-reset";
    case "budget-delete":
      return "before-delete";
    case "daily-app-open":
      return "daily-checkpoint";
  }
}

function changedAreasForEvent(event: VersionHistoryLifecycleEvent, changedAreas?: string[]): string[] {
  if (changedAreas?.length) {
    return changedAreas;
  }

  switch (event) {
    case "timed-dirty-budget-checkpoint":
      return ["budget data"];
    case "budget-switch":
      return ["active budget"];
    case "ynab4-import-completed":
      return ["YNAB4 import", "budget data"];
    case "actual-import-completed":
      return ["Actual Budget import", "budget data"];
    case "budget-import-start":
      return ["budget data", "import"];
    case "budget-reset":
      return ["budget data", "settings"];
    case "budget-delete":
      return ["budget registry", "budget data"];
    case "daily-app-open":
      return ["budget data"];
  }
}

function approximateChangesForEvent(event: VersionHistoryLifecycleEvent, approximateChanges?: string): string {
  if (approximateChanges?.trim()) {
    return approximateChanges.trim();
  }

  switch (event) {
    case "timed-dirty-budget-checkpoint":
      return "dirty-budget interval";
    case "budget-switch":
    case "daily-app-open":
      return "low";
    case "budget-import-start":
    case "budget-reset":
    case "budget-delete":
      return "potentially high";
    case "ynab4-import-completed":
    case "actual-import-completed":
      return "import-sized";
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
        origin: "automatic",
        reason: reasonForEvent(event),
        description: descriptionForEvent(event, input.description),
        changedAreas: changedAreasForEvent(event, input.changedAreas),
        approximateChanges: approximateChangesForEvent(event, input.approximateChanges),
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
        origin: "automatic",
        reason: reasonForEvent(event),
        description: descriptionForEvent(event, input.description),
        changedAreas: changedAreasForEvent(event, input.changedAreas),
        approximateChanges: approximateChangesForEvent(event, input.approximateChanges),
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

export function createTimedDirtyBudgetVersionHistoryCheckpoint(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  try {
    return {
      event: "timed-dirty-budget-checkpoint",
      ...createVersionHistorySnapshot(storage, {
        source: "automatic",
        origin: "automatic",
        reason: "timed-dirty-budget-checkpoint",
        description: input.description ?? "Timed automatic restore point for unsaved budget changes.",
        changedAreas: input.changedAreas ?? ["budget data"],
        approximateChanges: input.approximateChanges ?? "dirty-budget interval",
        now: input.now,
      }),
    };
  } catch (error) {
    return failed("timed-dirty-budget-checkpoint", error);
  }
}
