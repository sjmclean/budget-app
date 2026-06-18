import { BackupRecord } from "../../types/src/BackupRecord.js";
import { createBackupRecord } from "../../budget-engine/src/services/createBackupRecord.js";
import { BackupRecordRepository } from "../../repository/src/BackupRecordRepository.js";
import { BudgetUserRepository } from "../../repository/src/BudgetUserRepository.js";
import {
  canEditBudget,
  canDeleteBudget,
} from "../../budget-engine/src/services/permissions.js";

export class BackupApplicationService {
  constructor(
    private backupRepo: BackupRecordRepository,
    private budgetUserRepo: BudgetUserRepository,
  ) {}

  async recordBackup(
    userId: string,
    budgetId: string,
    filePath: string,
  ): Promise<BackupRecord> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canEditBudget(role)) throw new Error("Permission denied");

    const record = createBackupRecord(budgetId, userId, filePath);
    await this.backupRepo.create(record);
    return record;
  }

  async restoreBudget(
    userId: string,
    budgetId: string,
    filePath: string,
  ): Promise<BackupRecord> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canDeleteBudget(role)) throw new Error("Permission denied");

    const record = createBackupRecord(budgetId, userId, filePath);
    await this.backupRepo.create(record);
    return record;
  }
}
