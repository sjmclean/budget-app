import { createDatabase } from "../packages/database/src/db.js";
import { createRandomBudgetKey } from "../packages/security/src/keys.js";
import { SqliteEncryptedRecordRepository } from "../packages/repository/src/SqliteEncryptedRecordRepository.js";
import { EncryptedRecordApplicationService } from "../packages/application/src/EncryptedRecordApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");
  const repo = new SqliteEncryptedRecordRepository(db);
  const service = new EncryptedRecordApplicationService(repo);
  const key = createRandomBudgetKey();

  const original = {
    id: "transaction-1",
    amount: -15000,
    memo: "Groceries"
  };

  const encrypted = await service.saveEncrypted({
    budgetId: "budget",
    entityType: "Transaction",
    entityId: original.id,
    keyVersion: 1,
    plainObject: original,
    key
  });

  const reloaded = await repo.getByEntity("Transaction", original.id);
  if (!reloaded) throw new Error("Missing encrypted record");

  console.log(encrypted);
  console.log(service.decrypt(reloaded, key));
}

main();
