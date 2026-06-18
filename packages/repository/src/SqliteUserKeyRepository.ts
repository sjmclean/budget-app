import { eq } from "drizzle-orm";
import { userKeys } from "../../database/src/schema.js";
import { UserKey } from "../../types/src/UserKey.js";
import { UserKeyRepository } from "./UserKeyRepository.js";

export class SqliteUserKeyRepository implements UserKeyRepository {
  constructor(private db: any) {}

  async create(userKey: UserKey): Promise<void> {
    await this.db.insert(userKeys).values(userKey);
  }

  async getByUser(userId: string): Promise<UserKey | null> {
    const rows = await this.db
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId));
    return rows[0] ?? null;
  }
}
