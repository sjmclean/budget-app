import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget, createAccount, createTransaction } from "../packages/budget-engine/src/index.js";
import { AccountType, BudgetParticipation, ClearedStatus } from "../packages/types/src/index.js";
import { SqliteBudgetRepository, SqliteAccountRepository, SqliteTransactionRepository, SqliteCommandHistoryRepository } from "../packages/repository/src/index.js";
import { UndoRedoApplicationService } from "../packages/application/src/UndoRedoApplicationService.js";

const db = createDatabase(join(mkdtempSync(join(tmpdir(), "v1214-undo-")), "undo.sqlite"));
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const txRepo = new SqliteTransactionRepository(db);
const historyRepo = new SqliteCommandHistoryRepository(db);
const undoRedo = new UndoRedoApplicationService(historyRepo, db);

const budget = createBudget("Undo Coverage", "AUD");
await budgetRepo.create(budget);
const account = createAccount({ budgetId: budget.id, name: "Everyday", type: AccountType.Checking, participation: BudgetParticipation.OnBudget, openingBalance: 0 });
await accountRepo.create(account);
const tx = createTransaction({ budgetId: budget.id, accountId: account.id, date: "2026-06-01", amount: -500, clearedStatus: ClearedStatus.Uncleared, memo: "before" });
await txRepo.create(tx);

const edited = { ...tx, memo: "after", amount: -750, updatedAt: new Date() };
await txRepo.update(edited);
const command = await undoRedo.recordCommand({
  budgetId: budget.id,
  commandType: "transaction.edit",
  entityType: "transaction",
  entityId: tx.id,
  undoPayload: { action: "updateTransaction", transaction: tx },
  redoPayload: { action: "updateTransaction", transaction: edited }
});

await undoRedo.undoLast(budget.id);
const undone = await txRepo.getById(tx.id);
if (!undone || undone.memo !== "before" || undone.amount !== -500) throw new Error("Expected executable undo to restore transaction state");

await undoRedo.redoLast(budget.id);
const redone = await txRepo.getById(tx.id);
if (!redone || redone.memo !== "after" || redone.amount !== -750) throw new Error("Expected executable redo to restore edited transaction state");

console.log("v1.2.14 expanded undo coverage OK");
