import { eq } from "drizzle-orm";
import { cloudStorageSettings } from "../../database/src/schema.js";
import { CloudStorageSettings } from "../../types/src/CloudStorageSettings.js";
import { CloudStorageSettingsRepository } from "./CloudStorageSettingsRepository.js";

export class SqliteCloudStorageSettingsRepository implements CloudStorageSettingsRepository {
  constructor(private db: any) {}

  async create(item: CloudStorageSettings): Promise<void> {
    await this.db.insert(cloudStorageSettings).values(item);
  }

  async update(item: CloudStorageSettings): Promise<void> {
    await this.db
      .update(cloudStorageSettings)
      .set(item)
      .where(eq(cloudStorageSettings.id, item.id));
  }

  async findByUserId(userId: string): Promise<CloudStorageSettings[]> {
    return await this.db
      .select()
      .from(cloudStorageSettings)
      .where(eq(cloudStorageSettings.userId, userId));
  }
}
