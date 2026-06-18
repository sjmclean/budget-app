import { ChangeOperation } from "../../types/src/ChangeOperation.js";
import { ChangeRecord } from "../../types/src/ChangeRecord.js";
import { SyncPlan } from "../../types/src/SyncPlan.js";
import { createChangeRecord } from "../../budget-engine/src/services/createChangeRecord.js";
import {
  createSyncState,
  markSynced,
} from "../../budget-engine/src/services/createSyncState.js";
import { planSync } from "../../budget-engine/src/services/planSync.js";
import { ChangeRecordRepository } from "../../repository/src/ChangeRecordRepository.js";
import { SyncStateRepository } from "../../repository/src/SyncStateRepository.js";

export class SyncApplicationService {
  constructor(
    private changeRepo: ChangeRecordRepository,
    private syncStateRepo: SyncStateRepository,
  ) {}

  async recordChange(input: {
    budgetId: string;
    deviceId: string;
    entityType: string;
    entityId: string;
    operation: ChangeOperation;
    eventId?: string | null;
  }): Promise<ChangeRecord> {
    const change = createChangeRecord(input);
    await this.changeRepo.create(change);
    return change;
  }

  async getOrCreateSyncState(budgetId: string, deviceId: string) {
    const existing = await this.syncStateRepo.getByBudgetAndDevice(
      budgetId,
      deviceId,
    );
    if (existing) return existing;

    const state = createSyncState(budgetId, deviceId);
    await this.syncStateRepo.create(state);
    return state;
  }

  async markSynced(budgetId: string, deviceId: string): Promise<void> {
    const state = await this.getOrCreateSyncState(budgetId, deviceId);
    const changes = await this.changeRepo.findByBudget(budgetId);
    const latest = changes[changes.length - 1] ?? null;
    await this.syncStateRepo.update(markSynced(state, latest));
  }

  plan(localChanges: ChangeRecord[], remoteChanges: ChangeRecord[]): SyncPlan {
    return planSync(localChanges, remoteChanges);
  }
}
