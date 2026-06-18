import { unlinkSync } from "fs";
import { sql } from "drizzle-orm";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { Ynab4DatabaseImportService } from "../packages/ynab4-importer/src/Ynab4DatabaseImportService.js";
import { accounts, transactions } from "../packages/database/src/schema.js";
import { eq } from "drizzle-orm";

const dbPath = "/tmp/budget-v1210-import-transaction-safety.sqlite";
try { unlinkSync(dbPath); } catch {}
const db = createDatabase(dbPath);
const budgetRepo = new SqliteBudgetRepository(db);
const budget = createBudget("v1.2.10 Import Transaction", "AUD");
await budgetRepo.create(budget);

// Force a failure only after the importer has already created upstream data such as
// accounts/categories/payees. If the importer is truly wrapped in a SQLite transaction,
// those earlier inserts will be rolled back when this trigger aborts the transaction insert.
await db.run(sql.raw(`
  CREATE TRIGGER abort_transaction_import
  BEFORE INSERT ON transactions
  BEGIN
    SELECT RAISE(ABORT, 'forced transaction import failure');
  END;
`));

const importer = new Ynab4DatabaseImportService(db);
let failed = false;
try {
  await importer.import({
    accountsCsv: "Account,Type,Balance\nEveryday,Checking,100.00",
    registerCsv: "Account,Date,Payee,Category,Memo,Outflow,Inflow,Cleared\nEveryday,2026-06-17,Grocer,Food,Test,10.00,,C",
    budgetCsv: "Month,Category,Budgeted,Outflows,Balance\n2026-06,Food,100.00,10.00,90.00"
  }, { budgetId: budget.id, sourceFileName: "forced-failure-export" });
} catch {
  failed = true;
}

if (!failed) throw new Error("Import should have failed because the trigger aborts transaction inserts");

const importedAccounts = await db.select().from(accounts).where(eq(accounts.budgetId, budget.id));
const importedTransactions = await db.select().from(transactions).where(eq(transactions.budgetId, budget.id));
if (importedAccounts.length !== 0 || importedTransactions.length !== 0) {
  throw new Error("Failed import should roll back accounts and transactions created earlier in the import");
}

console.log("v1.2.10 import transaction rollback safety OK");
