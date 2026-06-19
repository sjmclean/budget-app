import { createDatabase } from "../packages/database/src/db.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createPayee } from "../packages/budget-engine/src/services/createPayee.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { AccountRegisterApplicationService } from "../packages/application/src/AccountRegisterApplicationService.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const payeeRepo = new SqlitePayeeRepository(db);
  const transactionRepo = new SqliteTransactionRepository(db);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  const checking = createAccount(budget.id, "Everyday", AccountType.Checking, BudgetParticipation.OnBudget, 100_000);
  await accountRepo.create(checking);

  const group = createCategoryGroup(budget.id, "Food");
  await groupRepo.create(group);

  const groceries = createCategory(group.id, "Groceries");
  await categoryRepo.create(groceries);

  const woolworths = createPayee(budget.id, "Woolworths");
  await payeeRepo.create(woolworths);

  await transactionRepo.create(createTransaction({
    budgetId: budget.id,
    accountId: checking.id,
    payeeId: woolworths.id,
    categoryId: groceries.id,
    date: "2026-06-17",
    amount: -15_000,
    memo: "Weekly shop"
  }));

  await transactionRepo.create(createTransaction({
    budgetId: budget.id,
    accountId: checking.id,
    payeeId: null,
    categoryId: null,
    date: "2026-06-18",
    amount: 400_000,
    memo: "Salary"
  }));

  const service = new AccountRegisterApplicationService(
    accountRepo,
    transactionRepo,
    payeeRepo,
    groupRepo,
    categoryRepo
  );

  const view = await service.getAccountRegisterView({ accountId: checking.id, currencyCode: "AUD" });

  if (view.workingBalance !== 485_000) {
    throw new Error(`Expected working balance 485000, got ${view.workingBalance}`);
  }

  if (view.transactions.length !== 2) {
    throw new Error(`Expected 2 transactions, got ${view.transactions.length}`);
  }

  const groceryTransaction = view.transactions.find((transaction) => transaction.payee === "Woolworths");

  if (!groceryTransaction) {
    throw new Error("Expected Woolworths transaction in register view");
  }

  if (groceryTransaction.category !== "Groceries" || groceryTransaction.outflow !== 15_000) {
    throw new Error("Expected category and outflow mapping in register view");
  }

  console.log(view);
}

main();
