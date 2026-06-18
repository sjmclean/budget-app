import { eq } from "drizzle-orm";
import { users } from "../../database/src/schema.js";
import { User } from "../../types/src/User.js";
import { UserRepository } from "./UserRepository.js";

export class SqliteUserRepository implements UserRepository {
  constructor(private db: any) {}

  async create(user: User): Promise<void> {
    await this.db.insert(users).values(user);
  }

  async update(user: User): Promise<void> {
    await this.db.update(users).set(user).where(eq(users.id, user.id));
  }

  async getById(id: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0] ?? null;
  }

  async findByDisplayName(displayName: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.displayName, displayName));
    return rows[0] ?? null;
  }
}
