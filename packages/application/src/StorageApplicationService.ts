import { existsSync, statSync } from "fs";
import { BackupVersionRepository } from "../../repository/src/BackupVersionRepository.js";
import { TransactionAttachmentRepository } from "../../repository/src/TransactionAttachmentRepository.js";
import { BudgetUserRepository } from "../../repository/src/BudgetUserRepository.js";
import { calculateStorageUsage } from "../../budget-engine/src/services/calculateStorageUsage.js";
import { canViewBudget } from "../../budget-engine/src/services/permissions.js";
import { StorageUsage } from "../../types/src/StorageUsage.js";

export class StorageApplicationService {
  constructor(
    private backupRepo: BackupVersionRepository,
    private attachmentRepo: TransactionAttachmentRepository,
    private budgetUserRepo: BudgetUserRepository
  ) {}

  async getUsage(
    userId: string,
    budgetId: string,
    budgetFilePath: string
  ): Promise<StorageUsage> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canViewBudget(role)) throw new Error("Permission denied");

    const budgetFileSize = existsSync(budgetFilePath)
      ? statSync(budgetFilePath).size
      : 0;

    const backups = await this.backupRepo.findByBudget(budgetId);
    const attachments = await this.attachmentRepo.findByBudget(budgetId);

    return calculateStorageUsage(budgetFileSize, attachments, backups);
  }
}
