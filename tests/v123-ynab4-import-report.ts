import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { initDatabase, budgets, importRuns, importMaps, transactions } from "../packages/database/src/index.js";
import { Ynab4DatabaseImportService } from "../packages/ynab4-importer/src/index.js";

const sqlite = new Database(":memory:");
initDatabase(sqlite);
const db = drizzle(sqlite);

const budgetId = "budget-v123-report";
await db.insert(budgets).values({ id: budgetId, name: "Import Report Budget", currency: "AUD", createdAt: new Date() });

const service = new Ynab4DatabaseImportService(db);
const dryRun = await service.import({ registerCsv: `Account,Date,Payee,Category,Memo,Outflow,Inflow,Cleared
Checking,,Missing Date,Everyday:Groceries,,1.00,,` }, { budgetId, dryRun: true });
if (dryRun.status !== "dry-run") throw new Error("Expected dry-run status");
if (!dryRun.issues.some((issue) => issue.code === "YNAB4_TRANSACTION_MISSING_DATE")) throw new Error("Expected missing date issue in dry-run");

const result = await service.import({
  accountsCsv: `Account,Type,On Budget,Balance
Checking,Checking,true,0.00`,
  registerCsv: `Account,Date,Payee,Category,Memo,Outflow,Inflow,Cleared
Checking,2026-02-01,Cafe,Everyday:Dining,Coffee,5.50,,C`
}, { budgetId, userId: "user-report", sourceFileName: "Register.csv" });

const runs = await db.select().from(importRuns).where(eq(importRuns.id, result.importRunId));
if (runs.length !== 1) throw new Error("Import run was not recorded");
if (runs[0].status !== "completed") throw new Error(`Unexpected import status ${runs[0].status}`);
const summary = JSON.parse(runs[0].summaryJson);
if (summary.created.transactions !== 1) throw new Error("Import summary did not record created transaction count");

const maps = await db.select().from(importMaps).where(eq(importMaps.importRunId, result.importRunId));
if (!maps.find((map) => map.targetEntityType === "transaction")) throw new Error("Transaction import map missing");
const transactionRows = await db.select().from(transactions).where(eq(transactions.budgetId, budgetId));
if (transactionRows.length !== 1) throw new Error("Expected exactly one imported transaction");

console.log("PASS: v1.2.3 records import runs, import maps, dry-run validation, and completion reports");
