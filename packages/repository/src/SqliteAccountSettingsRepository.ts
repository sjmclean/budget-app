import { eq } from "drizzle-orm";
import { accountSettings } from "../../database/src/schema.js";
import { AccountSettings } from "../../types/src/AccountSettings.js";
import { AccountSettingsRepository } from "./AccountSettingsRepository.js";

export class SqliteAccountSettingsRepository implements AccountSettingsRepository {
  constructor(private db: any) {}

  async create(item: AccountSettings): Promise<void> {
    await this.db.insert(accountSettings).values(item);
  }

  async update(item: AccountSettings): Promise<void> {
    await this.db
      .update(accountSettings)
      .set(item)
      .where(eq(accountSettings.id, item.id));
  }

  async findByAccountId(accountId: string): Promise<AccountSettings[]> {
    return await this.db
      .select()
      .from(accountSettings)
      .where(eq(accountSettings.accountId, accountId));
  }
}
