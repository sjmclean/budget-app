import { createRandomBudgetKey } from "../packages/security/src/keys.js";
import {
  encryptPayload,
  decryptPayload,
} from "../packages/security/src/encryptedPayloads.js";

const key = createRandomBudgetKey();

const backupPayload = JSON.stringify({
  budgetFile: "Household.budget",
  createdAt: "2026-06-17T00:00:00Z",
});

const encrypted = encryptPayload(backupPayload, key);
const decrypted = decryptPayload(encrypted, key);

console.log(encrypted);
console.log(JSON.parse(decrypted));
