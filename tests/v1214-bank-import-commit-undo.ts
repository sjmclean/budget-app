import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget, createAccount } from "../packages/budget-engine/src/index.js";
import { AccountType, BudgetParticipation, type ImportedBankTransaction } from "../packages/types/src/index.js";
import { SqliteBudgetRepository, SqliteAccountRepository, SqliteTransactionRepository, SqliteBankImportBatchRepository } from "../packages/repository/src/index.js";
import { BankImportCommitApplicationService } from "../packages/application/src/BankImportCommitApplicationService.js";

const db = createDatabase(join(mkdtempSync(join(tmpdir(), "v1214-bank-")), "bank.sqlite"));
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const txRepo = new SqliteTransactionRepository(db);
const batchRepo = new SqliteBankImportBatchRepository(db);
const service = new BankImportCommitApplicationService(db, batchRepo, txRepo);

const budget = createBudget("Bank Import Budget", "AUD");
await budgetRepo.create(budget);
const account = createAccount({ budgetId: budget.id, name: "Everyday", type: AccountType.Checking, participation: BudgetParticipation.OnBudget, openingBalance: 0 });
await accountRepo.create(account);

const rows: ImportedBankTransaction[] = [
  { externalId: "fitid-1", date: "2026-06-01", rawPayee: "WOOLWORTHS", memo: "CARD", amount: -1234, importedCategoryName: null },
  { externalId: "fitid-2", date: "2026-06-02", rawPayee: "ACME PAYROLL", memo: null, amount: 250000, importedCategoryName: null }
];

const result = await service.commit({ budgetId: budget.id, accountId: account.id, userId: "user-1", source: "csv", sourceFileName: "statement.csv", importedRows: rows });
if (result.createdTransactionIds.length !== 2) throw new Error("Expected two committed bank transactions");
if ((await txRepo.findByBudget(budget.id)).length !== 2) throw new Error("Expected committed transactions in repository");

const batch = await batchRepo.getBatch(result.batch.id);
if (!batch || batch.status !== "committed") throw new Error("Expected committed bank import batch");
if ((await batchRepo.findItems(result.batch.id)).length !== 2) throw new Error("Expected batch item audit records");

const undone = await service.undo(result.batch.id);
if (undone !== 2) throw new Error("Expected undo to affect two imported transactions");
const afterUndo = await txRepo.findByBudget(budget.id);
if (!afterUndo.every((tx) => tx.isDeleted)) throw new Error("Expected undo to soft-delete imported transactions");

console.log("v1.2.14 bank import commit/undo OK");
