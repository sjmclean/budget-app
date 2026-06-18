import { eq } from "drizzle-orm";
import { userSettings } from "../../database/src/schema.js";
import { UserSettings } from "../../types/src/UserSettings.js";
import { UserSettingsRepository } from "./UserSettingsRepository.js";

export class SqliteUserSettingsRepository implements UserSettingsRepository {
  constructor(private db: any) {}

  async create(settings: UserSettings): Promise<void> {
    await this.db.insert(userSettings).values(settings);
  }

  async update(settings: UserSettings): Promise<void> {
    await this.db
      .update(userSettings)
      .set(settings)
      .where(eq(userSettings.id, settings.id));
  }

  async getByUser(userId: string): Promise<UserSettings | null> {
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return rows[0] ?? null;
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(userSettings).where(eq(userSettings.userId, userId));
  }
}
