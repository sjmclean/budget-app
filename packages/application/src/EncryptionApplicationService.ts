import { EncryptionRecords, createEncryptionRecords } from "../../budget-engine/src/services/createEncryptionRecords.js";
import { UserKeyRepository } from "../../repository/src/UserKeyRepository.js";
import { BudgetKeyRepository } from "../../repository/src/BudgetKeyRepository.js";
import { EncryptedBudgetKeyRepository } from "../../repository/src/EncryptedBudgetKeyRepository.js";

export class EncryptionApplicationService {
  constructor(
    private userKeyRepo: UserKeyRepository,
    private budgetKeyRepo: BudgetKeyRepository,
    private encryptedBudgetKeyRepo: EncryptedBudgetKeyRepository
  ) {}

  async initialiseUserBudgetKeys(
    userId: string,
    budgetId: string,
    password: string
  ): Promise<EncryptionRecords> {
    const records = createEncryptionRecords(userId, budgetId, password);

    await this.userKeyRepo.create(records.userKey);
    await this.budgetKeyRepo.create(records.budgetKey);
    await this.encryptedBudgetKeyRepo.create(records.encryptedBudgetKey);

    return records;
  }
}
