import { SyncState } from "../../types/src/SyncState.js";

export interface SyncStateRepository {
  create(state: SyncState): Promise<void>;
  update(state: SyncState): Promise<void>;
  getByBudgetAndDevice(
    budgetId: string,
    deviceId: string,
  ): Promise<SyncState | null>;
}
