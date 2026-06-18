import { and, eq } from "drizzle-orm";
import { encryptedRecords } from "../../database/src/schema.js";
import { EncryptedRecord } from "../../types/src/EncryptedRecord.js";
import { EncryptedRecordRepository } from "./EncryptedRecordRepository.js";

export class SqliteEncryptedRecordRepository implements EncryptedRecordRepository {
  constructor(private db: any) {}

  async create(record: EncryptedRecord): Promise<void> {
    await this.db.insert(encryptedRecords).values(record);
  }

  async getByEntity(
    entityType: string,
    entityId: string,
  ): Promise<EncryptedRecord | null> {
    const rows = await this.db
      .select()
      .from(encryptedRecords)
      .where(
        and(
          eq(encryptedRecords.entityType, entityType),
          eq(encryptedRecords.entityId, entityId),
        ),
      );

    return rows[0] ?? null;
  }

  async findByBudget(budgetId: string): Promise<EncryptedRecord[]> {
    return await this.db
      .select()
      .from(encryptedRecords)
      .where(eq(encryptedRecords.budgetId, budgetId));
  }
}
