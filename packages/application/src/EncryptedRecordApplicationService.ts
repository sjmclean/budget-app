import { EncryptedRecord } from "../../types/src/EncryptedRecord.js";
import { createEncryptedRecord, decryptEncryptedRecord } from "../../budget-engine/src/services/createEncryptedRecord.js";
import { EncryptedRecordRepository } from "../../repository/src/EncryptedRecordRepository.js";

export class EncryptedRecordApplicationService {
  constructor(private repo: EncryptedRecordRepository) {}

  async saveEncrypted(input: {
    budgetId: string;
    entityType: string;
    entityId: string;
    keyVersion: number;
    plainObject: unknown;
    key: Buffer;
  }): Promise<EncryptedRecord> {
    const record = createEncryptedRecord(input);
    await this.repo.create(record);
    return record;
  }

  decrypt<T>(record: EncryptedRecord, key: Buffer): T {
    return decryptEncryptedRecord<T>(record, key);
  }
}
