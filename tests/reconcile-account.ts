import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { createReconciliation } from "../packages/budget-engine/src/services/createReconciliation.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteReconciliationRepository } from "../packages/repository/src/SqliteReconciliationRepository.js";
import { resetDatabase } from "./reset.js";
async function main() { resetDatabase(); const db = createDatabase("Test.budget"); const budgetRepo = new SqliteBudgetRepository(db); const accountRepo = new SqliteAccountRepository(db); const txRepo = new SqliteTransactionRepository(db); const recRepo = new SqliteReconciliationRepository(db); const budget = createBudget("Household Budget"); await budgetRepo.create(budget); const checking = createAccount(budget.id, "Checking", AccountType.Checking, BudgetParticipation.OnBudget, 500000); await accountRepo.create(checking); await txRepo.create(createTransaction({ budgetId: budget.id, accountId: checking.id, date: "2026-06-17", amount: -15000, clearedStatus: ClearedStatus.Cleared })); const txs = await txRepo.findByAccount(checking.id); const rec = createReconciliation(budget.id, checking, txs, "2026-06-17", 485000); await recRepo.create(rec); console.log(await recRepo.findByAccount(checking.id)); }
main();
