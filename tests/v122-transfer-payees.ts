import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteTransactionPayeeUpdater } from "../packages/repository/src/SqliteTransactionPayeeUpdater.js";
import { PayeeManagementApplicationService } from "../packages/application/src/PayeeManagementApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const payeeRepo = new SqlitePayeeRepository(db);
  const txRepo = new SqliteTransactionRepository(db);
  const updater = new SqliteTransactionPayeeUpdater(db);
  const service = new PayeeManagementApplicationService(payeeRepo, updater);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const checking = createAccount(
    budget.id,
    "Checking",
    AccountType.Checking,
    BudgetParticipation.OnBudget,
    0,
  );
  await accountRepo.create(checking);

  const transferPayee = await service.createPayee(
    budget.id,
    "Transfer : Savings",
  );
  if (!transferPayee.isTransfer)
    throw new Error("Expected transfer-style payee to be marked as transfer");

  const target = await service.createPayee(budget.id, "Woolworths");
  const source = await service.createPayee(budget.id, "Woolworths Online");
  await txRepo.create(
    createTransaction({
      budgetId: budget.id,
      accountId: checking.id,
      payeeId: source.id,
      categoryId: null,
      date: "2026-06-17",
      amount: -4500,
    }),
  );

  await service.mergePayees(source.id, target.id);
  const sourceAfterMerge = await payeeRepo.findById(source.id);
  if (!sourceAfterMerge?.isArchived)
    throw new Error("Expected merged source payee to be archived");
  const txs = await txRepo.findByAccount(checking.id);
  if (txs[0].payeeId !== target.id)
    throw new Error("Expected merged transactions to move to target payee");

  console.log("v1.2.2 transfer payee detection and payee merge OK");
}

main();
