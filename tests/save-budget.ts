import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { resetDatabase } from "./reset.js";
async function main() { resetDatabase(); const db = createDatabase("Test.budget"); const repo = new SqliteBudgetRepository(db); const budget = createBudget("Household Budget"); await repo.create(budget); console.log(await repo.getById(budget.id)); }
main();
