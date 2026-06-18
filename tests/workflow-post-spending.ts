import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createPayee } from "../packages/budget-engine/src/services/createPayee.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
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
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const payeeRepo = new SqlitePayeeRepository(db);
  const txRepo = new SqliteTransactionRepository(db);
  const budgetMonthRepo = new SqliteBudgetMonthRepository(db);
  const categoryMonthRepo = new SqliteCategoryMonthRepository(db);
  const budgetService = new BudgetApplicationService(
    budgetMonthRepo,
    categoryMonthRepo,
  );
  const txService = new TransactionApplicationService(
    accountRepo,
    txRepo,
    budgetMonthRepo,
    categoryMonthRepo,
    budgetService,
  );

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const checking = createAccount(
    budget.id,
    "Checking",
    AccountType.Checking,
    BudgetParticipation.OnBudget,
    500000,
  );
  await accountRepo.create(checking);
  const food = createCategoryGroup(budget.id, "Food");
  await groupRepo.create(food);
  const groceries = createCategory(food.id, "Groceries");
  await categoryRepo.create(groceries);
  const woolworths = createPayee(budget.id, "Woolworths");
  await payeeRepo.create(woolworths);

  await budgetService.postIncomeToReadyToBudget(budget.id, "2026-06", 400000);
  await budgetService.assignMoney(budget.id, "2026-06", groceries.id, 50000);
  const result = await txService.postSpending({
    budgetId: budget.id,
    month: "2026-06",
    accountId: checking.id,
    payeeId: woolworths.id,
    categoryId: groceries.id,
    date: "2026-06-17",
    amount: -15000,
  });

  console.log(result);
}
main();
