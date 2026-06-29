import { SELECTED_BUDGET_STORAGE_KEY } from "./budgetDataScope";
import {
  createVersionHistorySnapshot,
  type CreateVersionHistorySnapshotResult,
} from "./versionHistory";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const VERSION_HISTORY_LIFECYCLE_RELEASE = "v2.33.1";

export type VersionHistoryLifecycleEvent = "budget-switch" | "ynab4-import-completed";

export interface VersionHistoryLifecycleSnapshotResult extends CreateVersionHistorySnapshotResult {
  event: VersionHistoryLifecycleEvent;
  skippedReason?: string;
}

export interface VersionHistoryLifecycleSnapshotInput {
  now?: Date;
}

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

export function createVersionHistorySnapshotAfterYnab4Import(
  storage: KeyValueStoragePort,
  input: VersionHistoryLifecycleSnapshotInput = {},
): VersionHistoryLifecycleSnapshotResult {
  return createAutomaticLifecycleSnapshot(storage, "ynab4-import-completed", input);
}
