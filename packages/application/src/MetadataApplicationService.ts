import { BudgetMetadata } from "../../types/src/BudgetMetadata.js";
import {
  createBudgetMetadata,
  markBudgetOpened,
} from "../../budget-engine/src/services/createBudgetMetadata.js";
import { BudgetMetadataRepository } from "../../repository/src/BudgetMetadataRepository.js";

export class MetadataApplicationService {
  constructor(private metadataRepo: BudgetMetadataRepository) {}

  async ensureMetadata(
    budgetId: string,
    schemaVersion = 1,
    appVersion = "0.6.0",
  ): Promise<BudgetMetadata> {
    const existing = await this.metadataRepo.getByBudget(budgetId);
    if (existing) return existing;

    const metadata = createBudgetMetadata(budgetId, schemaVersion, appVersion);
    await this.metadataRepo.create(metadata);
    return metadata;
  }

  async markOpened(budgetId: string): Promise<BudgetMetadata> {
    const metadata = await this.ensureMetadata(budgetId);
    const updated = markBudgetOpened(metadata);
    await this.metadataRepo.update(updated);
    return updated;
  }
}
