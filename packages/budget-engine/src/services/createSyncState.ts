import { randomUUID } from "crypto";
import { SyncState } from "../../../types/src/SyncState.js";
import { ChangeRecord } from "../../../types/src/ChangeRecord.js";

export function createSyncState(budgetId: string, deviceId: string): SyncState {
  const now = new Date();

  return {
    id: randomUUID(),
    budgetId,
    deviceId,
    lastSyncedAt: null,
    lastChangeHash: null,
    createdAt: now,
    updatedAt: now
  };
}

export function markSynced(state: SyncState, latestChange: ChangeRecord | null): SyncState {
  const now = new Date();

  return {
    ...state,
    lastSyncedAt: now,
    lastChangeHash: latestChange?.changeHash ?? state.lastChangeHash,
    updatedAt: now
  };
}
