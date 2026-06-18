import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createPayee } from "../packages/budget-engine/src/services/createPayee.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import { resetDatabase } from "./reset.js";
async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const payeeRepo = new SqlitePayeeRepository(db);
  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  await payeeRepo.create(createPayee(budget.id, "Woolworths"));
  console.log(await payeeRepo.findByBudget(budget.id));
}
main();
