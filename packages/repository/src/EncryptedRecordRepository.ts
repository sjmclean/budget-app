import { EncryptedRecord } from "../../types/src/EncryptedRecord.js";

export interface EncryptedRecordRepository {
  create(record: EncryptedRecord): Promise<void>;
  getByEntity(
    entityType: string,
    entityId: string,
  ): Promise<EncryptedRecord | null>;
  findByBudget(budgetId: string): Promise<EncryptedRecord[]>;
}
