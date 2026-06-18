import { eq } from "drizzle-orm";
import { recentFiles } from "../../database/src/schema.js";
import { RecentFile } from "../../types/src/RecentFile.js";
import { RecentFileRepository } from "./RecentFileRepository.js";

export class SqliteRecentFileRepository implements RecentFileRepository {
  constructor(private db: any) {}

  async create(item: RecentFile): Promise<void> {
    await this.db.insert(recentFiles).values(item);
  }

  async update(item: RecentFile): Promise<void> {
    await this.db
      .update(recentFiles)
      .set(item)
      .where(eq(recentFiles.id, item.id));
  }

  async findByUserId(userId: string): Promise<RecentFile[]> {
    return await this.db
      .select()
      .from(recentFiles)
      .where(eq(recentFiles.userId, userId));
  }
}
