import { eq } from "drizzle-orm";
import { budgetMetadata } from "../../database/src/schema.js";
import { BudgetMetadata } from "../../types/src/BudgetMetadata.js";
import { BudgetMetadataRepository } from "./BudgetMetadataRepository.js";

export class SqliteBudgetMetadataRepository implements BudgetMetadataRepository {
  constructor(private db: any) {}

  async create(metadata: BudgetMetadata): Promise<void> {
    await this.db.insert(budgetMetadata).values(metadata);
  }

  async update(metadata: BudgetMetadata): Promise<void> {
    await this.db
      .update(budgetMetadata)
      .set(metadata)
      .where(eq(budgetMetadata.id, metadata.id));
  }

  async getByBudget(budgetId: string): Promise<BudgetMetadata | null> {
    const rows = await this.db
      .select()
      .from(budgetMetadata)
      .where(eq(budgetMetadata.budgetId, budgetId));
    return rows[0] ?? null;
  }
}
