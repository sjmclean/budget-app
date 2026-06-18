import { and, eq } from "drizzle-orm";
import { syncStates } from "../../database/src/schema.js";
import { SyncState } from "../../types/src/SyncState.js";
import { SyncStateRepository } from "./SyncStateRepository.js";

export class SqliteSyncStateRepository implements SyncStateRepository {
  constructor(private db: any) {}

  async create(state: SyncState): Promise<void> {
    await this.db.insert(syncStates).values(state);
  }

  async update(state: SyncState): Promise<void> {
    await this.db.update(syncStates).set(state).where(eq(syncStates.id, state.id));
  }

  async getByBudgetAndDevice(budgetId: string, deviceId: string): Promise<SyncState | null> {
    const rows = await this.db
      .select()
      .from(syncStates)
      .where(and(eq(syncStates.budgetId, budgetId), eq(syncStates.deviceId, deviceId)));

    return rows[0] ?? null;
  }
}
