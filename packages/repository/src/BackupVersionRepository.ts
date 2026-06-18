import { BackupVersion } from "../../types/src/BackupVersion.js";

export interface BackupVersionRepository {
  create(backup: BackupVersion): Promise<void>;
  findByBudget(budgetId: string): Promise<BackupVersion[]>;
  delete(id: string): Promise<void>;
}
