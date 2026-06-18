import { eq } from "drizzle-orm";
import { fileFingerprints } from "../../database/src/schema.js";
import { FileFingerprint } from "../../types/src/FileFingerprint.js";
import { FileFingerprintRepository } from "./FileFingerprintRepository.js";

export class SqliteFileFingerprintRepository implements FileFingerprintRepository {
  constructor(private db: any) {}

  async create(fingerprint: FileFingerprint): Promise<void> {
    await this.db.insert(fileFingerprints).values(fingerprint);
  }

  async findLatestByBudget(budgetId: string): Promise<FileFingerprint | null> {
    const rows = await this.db
      .select()
      .from(fileFingerprints)
      .where(eq(fileFingerprints.budgetId, budgetId));
    return rows[rows.length - 1] ?? null;
  }
}
