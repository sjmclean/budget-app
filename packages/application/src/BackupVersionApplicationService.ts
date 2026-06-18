import { BackupType } from "../../types/src/BackupType.js";
import { BackupVersion } from "../../types/src/BackupVersion.js";
import { createBackupVersion } from "../../budget-engine/src/services/createBackupVersion.js";
import { pruneAutomaticBackupVersions } from "../../budget-engine/src/services/pruneBackupVersions.js";
import {
  canDeleteBudget,
  canEditBudget,
} from "../../budget-engine/src/services/permissions.js";
import { BackupVersionRepository } from "../../repository/src/BackupVersionRepository.js";
import { BudgetUserRepository } from "../../repository/src/BudgetUserRepository.js";

export class BackupVersionApplicationService {
  constructor(
    private backupRepo: BackupVersionRepository,
    private budgetUserRepo: BudgetUserRepository,
  ) {}

  private async requireCanBackup(
    userId: string,
    budgetId: string,
  ): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canEditBudget(role)) throw new Error("Permission denied");
  }

  private async requireCanRestore(
    userId: string,
    budgetId: string,
  ): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canDeleteBudget(role)) throw new Error("Permission denied");
  }

  async createBackup(input: {
    budgetId: string;
    userId: string;
    type: BackupType;
    filePath: string;
    fileSize: number;
    note?: string | null;
  }): Promise<BackupVersion> {
    await this.requireCanBackup(input.userId, input.budgetId);

    const existing = await this.backupRepo.findByBudget(input.budgetId);
    const versionNumber =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((backup) => backup.versionNumber)) + 1;

    const backup = createBackupVersion({
      ...input,
      versionNumber,
    });

    await this.backupRepo.create(backup);

    if (input.type === BackupType.Automatic) {
      await this.pruneAutomaticBackups(input.budgetId, 10);
    }

    return backup;
  }

  async createManualBackup(input: {
    budgetId: string;
    userId: string;
    filePath: string;
    fileSize: number;
    note?: string | null;
  }): Promise<BackupVersion> {
    return await this.createBackup({
      ...input,
      type: BackupType.Manual,
    });
  }

  async createAutomaticBackup(input: {
    budgetId: string;
    userId: string;
    filePath: string;
    fileSize: number;
    note?: string | null;
  }): Promise<BackupVersion> {
    return await this.createBackup({
      ...input,
      type: BackupType.Automatic,
    });
  }

  async listBackups(
    userId: string,
    budgetId: string,
  ): Promise<BackupVersion[]> {
    await this.requireCanBackup(userId, budgetId);
    return await this.backupRepo.findByBudget(budgetId);
  }

  async restoreBackup(
    userId: string,
    budgetId: string,
    backupId: string,
  ): Promise<BackupVersion> {
    await this.requireCanRestore(userId, budgetId);

    const backups = await this.backupRepo.findByBudget(budgetId);
    const backup = backups.find((item) => item.id === backupId);

    if (!backup) throw new Error("Backup not found");

    return backup;
  }

  async pruneAutomaticBackups(
    budgetId: string,
    maxAutomaticBackups = 10,
  ): Promise<void> {
    const backups = await this.backupRepo.findByBudget(budgetId);
    const result = pruneAutomaticBackupVersions(backups, maxAutomaticBackups);

    for (const backup of result.remove) {
      await this.backupRepo.delete(backup.id);
    }
  }
}
