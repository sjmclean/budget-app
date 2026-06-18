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
  const payeeUpdater = new SqliteTransactionPayeeUpdater(db);
  const service = new PayeeManagementApplicationService(payeeRepo, payeeUpdater);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const account = createAccount(budget.id, "Checking", AccountType.Checking, BudgetParticipation.OnBudget, 0);
  await accountRepo.create(account);

  const woolworths = await service.createPayee(budget.id, "  Woolworths  ");
  const duplicate = await service.createPayee(budget.id, "Woolworths");
  if (duplicate.id !== woolworths.id) throw new Error("Expected normalized duplicate to reuse the existing payee");

  const renamed = await service.renamePayee(woolworths.id, "Woolworths Supermarket");
  if (renamed.name !== "Woolworths Supermarket") throw new Error("Expected payee rename to persist new display name");

  await txRepo.create(createTransaction({ budgetId: budget.id, accountId: account.id, payeeId: renamed.id, categoryId: null, date: "2026-06-17", amount: -1200 }));
  try {
    await service.deleteUnusedPayee(renamed.id);
    throw new Error("Expected used payee delete to be rejected");
  } catch (error: any) {
    if (!String(error.message).includes("Cannot delete")) throw error;
  }

  const unused = await service.createPayee(budget.id, "Unused Payee");
  await service.deleteUnusedPayee(unused.id);
  const deleted = await payeeRepo.findById(unused.id);
  if (deleted) throw new Error("Expected unused payee to be deleted");

  console.log("v1.2.2 payee CRUD, rename, duplicate prevention, and delete guard OK");
}

main();
