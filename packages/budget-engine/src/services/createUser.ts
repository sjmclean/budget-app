import { randomUUID } from "crypto";
import { User } from "../../../types/src/User.js";
import { createSalt, hashPassword } from "../../../security/src/passwords.js";

export function createUser(
  displayName: string,
  email: string | null,
  password: string,
): User {
  const now = new Date();
  const salt = createSalt();

  return {
    id: randomUUID(),
    displayName,
    email,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}
