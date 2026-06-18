import { randomUUID } from "crypto";
import { BudgetKey } from "../../../types/src/BudgetKey.js";
import { EncryptedBudgetKey } from "../../../types/src/EncryptedBudgetKey.js";
import { UserKey } from "../../../types/src/UserKey.js";
import { createSalt } from "../../../security/src/passwords.js";
import { createRandomBudgetKey, deriveUserKey, encryptWithKey, hashKey } from "../../../security/src/keys.js";

export interface EncryptionRecords {
  userKey: UserKey;
  budgetKey: BudgetKey;
  encryptedBudgetKey: EncryptedBudgetKey;
}

export function createEncryptionRecords(
  userId: string,
  budgetId: string,
  password: string
): EncryptionRecords {
  const now = new Date();
  const keySalt = createSalt();
  const userKeyBuffer = deriveUserKey(password, keySalt);
  const rawBudgetKey = createRandomBudgetKey();

  const userKey: UserKey = {
    id: randomUUID(),
    userId,
    keySalt,
    keyCheckHash: hashKey(userKeyBuffer),
    createdAt: now
  };

  const budgetKey: BudgetKey = {
    id: randomUUID(),
    budgetId,
    keyVersion: 1,
    encryptedKey: encryptWithKey(rawBudgetKey.toString("hex"), userKeyBuffer),
    createdAt: now
  };

  const encryptedBudgetKey: EncryptedBudgetKey = {
    id: randomUUID(),
    budgetId,
    userId,
    budgetKeyId: budgetKey.id,
    encryptedBudgetKey: budgetKey.encryptedKey,
    createdAt: now
  };

  return {
    userKey,
    budgetKey,
    encryptedBudgetKey
  };
}
