import { eq } from "drizzle-orm";
import { appSettings } from "../../database/src/schema.js";
import { AppSettings } from "../../types/src/AppSettings.js";
import { AppSettingsRepository } from "./AppSettingsRepository.js";

export class SqliteAppSettingsRepository implements AppSettingsRepository {
  constructor(private db: any) {}

  async create(item: AppSettings): Promise<void> {
    await this.db.insert(appSettings).values(item);
  }

  async update(item: AppSettings): Promise<void> {
    await this.db.update(appSettings).set(item).where(eq(appSettings.id, item.id));
  }

  async findByKey(key: string): Promise<AppSettings[]> {
    return await this.db.select().from(appSettings).where(eq(appSettings.key, key));
  }
}
