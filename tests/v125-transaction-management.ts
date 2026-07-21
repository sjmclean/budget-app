import { createTemporaryDatabase } from "./support/persistence/temporaryDatabase.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { TransactionManagementApplicationService } from "../packages/application/src/TransactionManagementApplicationService.js";

const { db, cleanup } = createTemporaryDatabase("budget-v125-management");
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const transactionRepo = new SqliteTransactionRepository(db);
const service = new TransactionManagementApplicationService(transactionRepo);

const budget = createBudget("v1.2.5 Transaction Management", "AUD");
await budgetRepo.create(budget);
const account = createAccount(budget.id, "Everyday", AccountType.Checking, BudgetParticipation.OnBudget, 0);
await accountRepo.create(account);
const transaction = createTransaction({ budgetId: budget.id, accountId: account.id, payeeId: null, categoryId: null, date: "2026-06-17", amount: -1000, memo: "Original" });
await transactionRepo.create(transaction);

const edited = await service.edit({ transactionId: transaction.id, memo: "Edited", amount: -1250 });
if (edited.memo !== "Edited" || edited.amount !== -1250) throw new Error("Expected transaction edit");

await service.delete(transaction.id);
const deleted = await transactionRepo.getById(transaction.id);
if (!deleted?.isDeleted) throw new Error("Expected soft delete");
await service.restore(transaction.id);
const restored = await transactionRepo.getById(transaction.id);
if (restored?.isDeleted) throw new Error("Expected restore");

await service.edit({ transactionId: transaction.id, clearedStatus: ClearedStatus.Reconciled });
let blocked = false;
try {
  await service.edit({ transactionId: transaction.id, memo: "Should block" });
} catch {
  blocked = true;
}
if (!blocked) throw new Error("Expected reconciled edit guard");
await service.edit({ transactionId: transaction.id, memo: "Override ok", forceReconciledEdit: true });
const overridden = await transactionRepo.getById(transaction.id);
if (overridden?.memo !== "Override ok") throw new Error("Expected explicit reconciled edit override");

console.log("v1.2.5 transaction management OK");
cleanup();
