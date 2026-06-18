import { unlinkSync } from "fs";
// import { randomUUID } from "crypto";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { TransactionType } from "../packages/types/src/TransactionType.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteCommandHistoryRepository } from "../packages/repository/src/SqliteCommandHistoryRepository.js";
import { UndoRedoApplicationService } from "../packages/application/src/UndoRedoApplicationService.js";

const dbPath = "/tmp/budget-v1210-real-undo-redo.sqlite";
try {
  unlinkSync(dbPath);
} catch {}
const db = createDatabase(dbPath);

const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const txRepo = new SqliteTransactionRepository(db);
const historyRepo = new SqliteCommandHistoryRepository(db);
const undoRedo = new UndoRedoApplicationService(historyRepo, db);

const budget = createBudget("v1.2.10 Undo Redo", "AUD");
await budgetRepo.create(budget);
const account = createAccount({
  budgetId: budget.id,
  name: "Everyday",
  type: AccountType.Checking,
  participation: BudgetParticipation.OnBudget,
  openingBalance: 0,
});
await accountRepo.create(account);

const transaction = createTransaction({
  budgetId: budget.id,
  accountId: account.id,
  payeeId: null,
  categoryId: null,
  type: TransactionType.Standard,
  date: "2026-06-17",
  memo: "Original memo",
  amount: -2500,
  clearedStatus: ClearedStatus.Uncleared,
});
await txRepo.create(transaction);

const edited = {
  ...transaction,
  memo: "Edited memo",
  amount: -3000,
  updatedAt: new Date(),
};
await txRepo.update(edited);
await undoRedo.recordCommand({
  budgetId: budget.id,
  commandType: "transaction.update",
  entityType: "transaction",
  entityId: transaction.id,
  undoPayload: { action: "updateTransaction", transaction },
  redoPayload: { action: "updateTransaction", transaction: edited },
});

await undoRedo.undoLast(budget.id);
const afterUndo = await txRepo.getById(transaction.id);
if (
  !afterUndo ||
  afterUndo.memo !== "Original memo" ||
  afterUndo.amount !== -2500
) {
  throw new Error("Undo should restore the transaction's previous values");
}

await undoRedo.redoLast(budget.id);
const afterRedo = await txRepo.getById(transaction.id);
if (
  !afterRedo ||
  afterRedo.memo !== "Edited memo" ||
  afterRedo.amount !== -3000
) {
  throw new Error("Redo should reapply the transaction edit");
}

await undoRedo.recordCommand({
  budgetId: budget.id,
  commandType: "transaction.delete",
  entityType: "transaction",
  entityId: transaction.id,
  undoPayload: { action: "restoreTransaction", transactionId: transaction.id },
  redoPayload: {
    action: "softDeleteTransaction",
    transactionId: transaction.id,
  },
});
await txRepo.softDelete(transaction.id);
await undoRedo.undoLast(budget.id);
const restored = await txRepo.getById(transaction.id);
if (!restored || restored.isDeleted)
  throw new Error("Undo should restore a soft-deleted transaction");

console.log("v1.2.10 real undo/redo execution OK");
