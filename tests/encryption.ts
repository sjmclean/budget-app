import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createUser } from "../packages/budget-engine/src/services/createUser.js";
import { createEncryptionRecords } from "../packages/budget-engine/src/services/createEncryptionRecords.js";
import { deriveUserKey, decryptWithKey } from "../packages/security/src/keys.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteUserKeyRepository } from "../packages/repository/src/SqliteUserKeyRepository.js";
import { SqliteBudgetKeyRepository } from "../packages/repository/src/SqliteBudgetKeyRepository.js";
import { SqliteEncryptedBudgetKeyRepository } from "../packages/repository/src/SqliteEncryptedBudgetKeyRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const userRepo = new SqliteUserRepository(db);
  const budgetRepo = new SqliteBudgetRepository(db);
  const userKeyRepo = new SqliteUserKeyRepository(db);
  const budgetKeyRepo = new SqliteBudgetKeyRepository(db);
  const encryptedBudgetKeyRepo = new SqliteEncryptedBudgetKeyRepository(db);

  const user = createUser("Stewart", null, "password123");
  const budget = createBudget("Household Budget");

  await userRepo.create(user);
  await budgetRepo.create(budget);

  const records = createEncryptionRecords(user.id, budget.id, "password123");

  await userKeyRepo.create(records.userKey);
  await budgetKeyRepo.create(records.budgetKey);
  await encryptedBudgetKeyRepo.create(records.encryptedBudgetKey);

  const userKey = deriveUserKey("password123", records.userKey.keySalt);
  const decryptedBudgetKey = decryptWithKey(records.budgetKey.encryptedKey, userKey);

  console.log(records.userKey);
  console.log(records.budgetKey);
  console.log(records.encryptedBudgetKey);
  console.log(decryptedBudgetKey.length);
}

main();
