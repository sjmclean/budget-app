import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { resetDatabase } from "./reset.js";
async function main() { resetDatabase(); const db = createDatabase("Test.budget"); const budgetRepo = new SqliteBudgetRepository(db); const accountRepo = new SqliteAccountRepository(db); const budget = createBudget("Household Budget"); await budgetRepo.create(budget); await accountRepo.create(createAccount(budget.id, "Checking", AccountType.Checking, BudgetParticipation.OnBudget, 500000)); console.log(await accountRepo.findByBudget(budget.id)); }
main();
