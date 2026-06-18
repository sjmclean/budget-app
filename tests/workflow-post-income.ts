import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { InflowDestination } from "../packages/types/src/InflowDestination.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteBudgetMonthRepository } from "../packages/repository/src/SqliteBudgetMonthRepository.js";
import { SqliteCategoryMonthRepository } from "../packages/repository/src/SqliteCategoryMonthRepository.js";
import { BudgetApplicationService } from "../packages/application/src/BudgetApplicationService.js";
import { TransactionApplicationService } from "../packages/application/src/TransactionApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const txRepo = new SqliteTransactionRepository(db);
  const budgetMonthRepo = new SqliteBudgetMonthRepository(db);
  const categoryMonthRepo = new SqliteCategoryMonthRepository(db);
  const budgetService = new BudgetApplicationService(budgetMonthRepo, categoryMonthRepo);
  const txService = new TransactionApplicationService(accountRepo, txRepo, budgetMonthRepo, categoryMonthRepo, budgetService);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const checking = createAccount(budget.id, "Checking", AccountType.Checking, BudgetParticipation.OnBudget, 0);
  await accountRepo.create(checking);

  await txService.postIncome({ budgetId: budget.id, month: "2026-06", accountId: checking.id, date: "2026-06-01", amount: 400000, destination: InflowDestination.ReadyToBudget });

  console.log(await accountRepo.getById(checking.id));
  console.log(await budgetMonthRepo.getByBudgetAndMonth(budget.id, "2026-06"));
}
main();
