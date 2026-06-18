import { eq } from "drizzle-orm";
import { backupVersions } from "../../database/src/schema.js";
import { BackupVersion } from "../../types/src/BackupVersion.js";
import { BackupVersionRepository } from "./BackupVersionRepository.js";

export class SqliteBackupVersionRepository implements BackupVersionRepository {
  constructor(private db: any) {}

  async create(backup: BackupVersion): Promise<void> {
    await this.db.insert(backupVersions).values(backup);
  }

  async findByBudget(budgetId: string): Promise<BackupVersion[]> {
    return await this.db.select().from(backupVersions).where(eq(backupVersions.budgetId, budgetId));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(backupVersions).where(eq(backupVersions.id, id));
  }
}
