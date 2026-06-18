import { eq } from "drizzle-orm";
import { backupRecords } from "../../database/src/schema.js";
import { BackupRecord } from "../../types/src/BackupRecord.js";
import { BackupRecordRepository } from "./BackupRecordRepository.js";

export class SqliteBackupRecordRepository implements BackupRecordRepository {
  constructor(private db: any) {}

  async create(record: BackupRecord): Promise<void> {
    await this.db.insert(backupRecords).values(record);
  }

  async findByBudget(budgetId: string): Promise<BackupRecord[]> {
    return await this.db.select().from(backupRecords).where(eq(backupRecords.budgetId, budgetId));
  }
}
