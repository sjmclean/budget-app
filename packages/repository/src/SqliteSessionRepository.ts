import { eq } from "drizzle-orm";
import { sessions } from "../../database/src/schema.js";
import { Session } from "../../types/src/Session.js";
import { SessionRepository } from "./SessionRepository.js";

export class SqliteSessionRepository implements SessionRepository {
  constructor(private db: any) {}

  async create(session: Session): Promise<void> {
    await this.db.insert(sessions).values(session);
  }

  async getById(id: string): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }
}
