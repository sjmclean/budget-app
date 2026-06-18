import { and, eq } from "drizzle-orm";
import { encryptedBudgetKeys } from "../../database/src/schema.js";
import { EncryptedBudgetKey } from "../../types/src/EncryptedBudgetKey.js";
import { EncryptedBudgetKeyRepository } from "./EncryptedBudgetKeyRepository.js";

export class SqliteEncryptedBudgetKeyRepository implements EncryptedBudgetKeyRepository {
  constructor(private db: any) {}

  async create(key: EncryptedBudgetKey): Promise<void> {
    await this.db.insert(encryptedBudgetKeys).values(key);
  }

  async getForUserAndBudget(
    userId: string,
    budgetId: string,
  ): Promise<EncryptedBudgetKey | null> {
    const rows = await this.db
      .select()
      .from(encryptedBudgetKeys)
      .where(
        and(
          eq(encryptedBudgetKeys.userId, userId),
          eq(encryptedBudgetKeys.budgetId, budgetId),
        ),
      );

    return rows[0] ?? null;
  }
}
