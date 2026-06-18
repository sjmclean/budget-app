import { unlinkSync } from "fs";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { createImportRun } from "../packages/budget-engine/src/services/createImportRun.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import { ImportSource } from "../packages/types/src/ImportRun.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteRecentFileRepository } from "../packages/repository/src/SqliteRecentFileRepository.js";
import { SqliteImportRunRepository } from "../packages/repository/src/SqliteImportRunRepository.js";
import { BudgetRegistryApplicationService } from "../packages/application/src/BudgetRegistryApplicationService.js";
import { SearchFilterApplicationService } from "../packages/application/src/SearchFilterApplicationService.js";
import { ImportReviewApplicationService } from "../packages/application/src/ImportReviewApplicationService.js";

const dbPath = "/tmp/budget-v126-registry.sqlite";
try {
  unlinkSync(dbPath);
} catch {}
const db = createDatabase(dbPath);
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const txRepo = new SqliteTransactionRepository(db);
const recentRepo = new SqliteRecentFileRepository(db);
const importRunRepo = new SqliteImportRunRepository(db);
const registry = new BudgetRegistryApplicationService(recentRepo);
const search = new SearchFilterApplicationService(txRepo);
const review = new ImportReviewApplicationService(importRunRepo);
const budget = createBudget("v1.2.6 Registry", "AUD");
await budgetRepo.create(budget);
const account = createAccount(
  budget.id,
  "Everyday",
  AccountType.Checking,
  BudgetParticipation.OnBudget,
  0,
);
await accountRepo.create(account);
await registry.registerBudget(
  "user-1",
  "/Budgets/Household.budget",
  "Household",
);
await registry.registerBudget("user-1", "/Budgets/Business.budget", "Business");
const budgets = await registry.listBudgetsForUser("user-1");
if (budgets.length !== 2)
  throw new Error("Expected multiple budgets in registry");
const tx = createTransaction({
  budgetId: budget.id,
  accountId: account.id,
  date: "2026-06-17",
  amount: -1000,
  clearedStatus: ClearedStatus.Cleared,
});
await txRepo.create(tx);
const filtered = await search.filterTransactions({
  budgetId: budget.id,
  clearedStatus: ClearedStatus.Cleared,
  amountMax: -500,
});
if (filtered.length !== 1)
  throw new Error("Expected transaction search filters");
const run = createImportRun({
  budgetId: budget.id,
  userId: "user-1",
  source: ImportSource.YNAB4,
  sourceFileName: "Budget.ynab4",
});
await importRunRepo.create(run);
const completed = await review.completeImportRun(run, {
  accounts: 1,
  transactions: 1,
});
if (
  completed.status !== "completed" ||
  review.getSummary(completed).accounts !== 1
)
  throw new Error("Expected import review summary");
console.log("v1.2.6 budget registry, import review, and search filters OK");
