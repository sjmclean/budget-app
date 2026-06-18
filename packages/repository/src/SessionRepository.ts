import { Session } from "../../types/src/Session.js";

export interface SessionRepository {
  create(session: Session): Promise<void>;
  getById(id: string): Promise<Session | null>;
  delete(id: string): Promise<void>;
}
