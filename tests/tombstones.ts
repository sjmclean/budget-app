import { createDatabase } from "../packages/database/src/db.js";
import { createDeletedItem } from "../packages/budget-engine/src/services/createDeletedItem.js";
import { SqliteDeletedItemRepository } from "../packages/repository/src/SqliteDeletedItemRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const repo = new SqliteDeletedItemRepository(db);

  const item = createDeletedItem({
    budgetId: "budget",
    entityType: "Transaction",
    entityId: "tx-1",
    deletedByUserId: "user",
    reason: "User deleted transaction",
  });

  await repo.create(item);

  console.log(await repo.findByBudgetId("budget"));
}

main();
