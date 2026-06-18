import { BackupRecord } from "../../types/src/BackupRecord.js";

export interface BackupRecordRepository {
  create(record: BackupRecord): Promise<void>;
  findByBudget(budgetId: string): Promise<BackupRecord[]>;
}
