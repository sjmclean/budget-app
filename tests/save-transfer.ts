import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransfer } from "../packages/budget-engine/src/services/createTransfer.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { resetDatabase } from "./reset.js";
async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const txRepo = new SqliteTransactionRepository(db);
  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const checking = createAccount(
    budget.id,
    "Checking",
    AccountType.Checking,
    BudgetParticipation.OnBudget,
    500000,
  );
  const savings = createAccount(
    budget.id,
    "Savings",
    AccountType.Savings,
    BudgetParticipation.OnBudget,
    100000,
  );
  await accountRepo.create(checking);
  await accountRepo.create(savings);
  const transfer = createTransfer({
    budgetId: budget.id,
    fromAccountId: checking.id,
    toAccountId: savings.id,
    date: "2026-06-17",
    amount: 25000,
  });
  await txRepo.create(transfer.outflow);
  await txRepo.create(transfer.inflow);
  console.log(await txRepo.findByBudget(budget.id));
}
main();
