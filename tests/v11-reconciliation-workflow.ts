import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { ReconciliationApplicationService } from "../packages/application/src/ReconciliationApplicationService.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteReconciliationRepository } from "../packages/repository/src/SqliteReconciliationRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const transactionRepo = new SqliteTransactionRepository(db);
  const reconciliationRepo = new SqliteReconciliationRepository(db);
  const service = new ReconciliationApplicationService(accountRepo, reconciliationRepo, transactionRepo);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const account = createAccount(budget.id, "Checking", AccountType.Checking, BudgetParticipation.OnBudget, 10000);
  await accountRepo.create(account);

  await transactionRepo.create(createTransaction({ budgetId: budget.id, accountId: account.id, date: "2026-06-10", amount: -2500, memo: "Cleared groceries", clearedStatus: ClearedStatus.Cleared }));
  await transactionRepo.create(createTransaction({ budgetId: budget.id, accountId: account.id, date: "2026-06-12", amount: -1200, memo: "Uncleared fuel", clearedStatus: ClearedStatus.Uncleared }));

  const result = await service.complete({ budgetId: budget.id, accountId: account.id, statementDate: "2026-06-17", statementBalance: 8000, createAdjustment: true });

  if (result.reconciliation.clearedBalance !== 7500) throw new Error(`Expected cleared balance 7500, got ${result.reconciliation.clearedBalance}`);
  if (result.reconciliation.difference !== 500) throw new Error(`Expected difference 500, got ${result.reconciliation.difference}`);
  if (!result.adjustmentTransaction) throw new Error("Expected adjustment transaction");
  if (result.adjustmentTransaction.amount !== 500) throw new Error(`Expected adjustment amount 500, got ${result.adjustmentTransaction.amount}`);

  console.log("PASS: reconciliation calculates cleared balance");
  console.log("PASS: reconciliation creates adjustment transaction when requested");
  console.log("v1.1 reconciliation workflow OK");
}

main();
