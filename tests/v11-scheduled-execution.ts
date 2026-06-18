import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createScheduledTransaction } from "../packages/budget-engine/src/services/createScheduledTransaction.js";
import { ScheduledTransactionExecutionService } from "../packages/application/src/ScheduledTransactionExecutionService.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ScheduledFrequency } from "../packages/types/src/ScheduledFrequency.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteScheduledTransactionRepository } from "../packages/repository/src/SqliteScheduledTransactionRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const scheduledRepo = new SqliteScheduledTransactionRepository(db);
  const txRepo = new SqliteTransactionRepository(db);
  const service = new ScheduledTransactionExecutionService(
    scheduledRepo,
    txRepo,
  );

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const account = createAccount(
    budget.id,
    "Checking",
    AccountType.Checking,
    BudgetParticipation.OnBudget,
    0,
  );
  await accountRepo.create(account);

  await scheduledRepo.create(
    createScheduledTransaction({
      budgetId: budget.id,
      accountId: account.id,
      amount: -5000,
      nextDueDate: "2026-06-01",
      frequency: ScheduledFrequency.Monthly,
    }),
  );

  const executed = await service.executeDue(budget.id, "2026-06-17");
  if (executed.length !== 1)
    throw new Error(
      `Expected 1 due scheduled transaction, got ${executed.length}`,
    );

  const transactions = await txRepo.findByBudget(budget.id);
  if (transactions.length !== 1)
    throw new Error(
      `Expected 1 materialised transaction, got ${transactions.length}`,
    );
  if (transactions[0].amount !== -5000)
    throw new Error(`Expected amount -5000, got ${transactions[0].amount}`);

  const updatedSchedules = await scheduledRepo.findActiveByBudget(budget.id);
  if (updatedSchedules.length !== 1)
    throw new Error(
      "Expected schedule to remain active after monthly advancement",
    );
  if (updatedSchedules[0].nextDueDate !== "2026-07-01") {
    throw new Error(
      `Expected next due date 2026-07-01, got ${updatedSchedules[0].nextDueDate}`,
    );
  }

  const secondRun = await service.executeDue(budget.id, "2026-06-17");
  if (secondRun.length !== 0)
    throw new Error(
      "Expected no duplicate execution after due date advancement",
    );

  console.log("PASS: due scheduled transaction materialised once");
  console.log("PASS: monthly scheduled transaction advanced to next month");
  console.log("v1.1 scheduled transaction execution OK");
}

main();
