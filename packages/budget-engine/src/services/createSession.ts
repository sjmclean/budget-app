import { randomUUID } from "crypto";
import { Session } from "../../../types/src/Session.js";

export function createSession(userId: string, durationHours = 12): Session {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  return {
    id: randomUUID(),
    userId,
    createdAt: now,
    expiresAt,
  };
}
