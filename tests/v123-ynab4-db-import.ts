import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import {
  initDatabase,
  budgets,
  accounts,
  categories,
  categoryGroups,
  payees,
  transactions,
  splitTransactionLines,
  transactionFlags,
  transactionNotes,
  budgetMonths,
  categoryMonths,
} from "../packages/database/src/index.js";
import { Ynab4DatabaseImportService } from "../packages/ynab4-importer/src/index.js";

const sqlite = new Database(":memory:");
initDatabase(sqlite);
const db = drizzle(sqlite);

const budgetId = "budget-v123";
await db.insert(budgets).values({
  id: budgetId,
  name: "Imported Budget",
  currency: "AUD",
  createdAt: new Date(),
});

const accountsCsv = `Account,Type,On Budget,Balance
Checking,Checking,true,1000.00
Savings,Savings,true,500.00`;

const registerCsv = `Account,Date,Payee,Category,Memo,Outflow,Inflow,Cleared,Flag
Checking,2026-01-01,Woolworths,Everyday:Groceries,Weekly shop,125.50,,C,Blue
Checking,2026-01-02,Employer,Income:Available This Month,Salary,,2500.00,R,
Checking,2026-01-03,Transfer : Savings,,Move money,200.00,,C,
Checking,2026-01-04,Split Transaction,Everyday:Groceries,Split example,50.00,,,
`;

const budgetCsv = `Month,Category,Budgeted,Outflows,Balance
2026-01,Everyday:Groceries,600.00,175.50,424.50
2026-01,Income:Available This Month,0.00,0.00,0.00`;

const service = new Ynab4DatabaseImportService(db);
const result = await service.import(
  { accountsCsv, registerCsv, budgetCsv },
  { budgetId, userId: "user-v123", sourceFileName: "YNAB4 Export" },
);

if (result.created.accounts !== 2)
  throw new Error(`Expected 2 accounts, got ${result.created.accounts}`);
if (result.created.categoryGroups < 2)
  throw new Error("Expected category groups to be imported");
if (result.created.categories < 2)
  throw new Error("Expected categories to be imported");
if (result.created.transactions !== 4)
  throw new Error(
    `Expected 4 transactions, got ${result.created.transactions}`,
  );
if (result.created.splitLines !== 1)
  throw new Error("Expected split line foundation to be created");
if (result.created.transactionFlags !== 1)
  throw new Error("Expected one transaction flag to be imported");
if (result.created.transactionNotes < 3)
  throw new Error("Expected memos to be imported as notes");
if (result.created.budgetMonths !== 1)
  throw new Error("Expected one budget month");
if (result.created.categoryMonths !== 2)
  throw new Error("Expected two category months");

const accountRows = await db
  .select()
  .from(accounts)
  .where(eq(accounts.budgetId, budgetId));
const groupRows = await db
  .select()
  .from(categoryGroups)
  .where(eq(categoryGroups.budgetId, budgetId));
const categoryRows = [];
for (const group of groupRows)
  categoryRows.push(
    ...(await db
      .select()
      .from(categories)
      .where(eq(categories.groupId, group.id))),
  );
const payeeRows = await db
  .select()
  .from(payees)
  .where(eq(payees.budgetId, budgetId));
const transactionRows = await db
  .select()
  .from(transactions)
  .where(eq(transactions.budgetId, budgetId));
const splitRows = await db.select().from(splitTransactionLines);
const flagRows = await db.select().from(transactionFlags);
const noteRows = await db.select().from(transactionNotes);
const budgetMonthRows = await db
  .select()
  .from(budgetMonths)
  .where(eq(budgetMonths.budgetId, budgetId));
const categoryMonthRows = await db.select().from(categoryMonths);

if (!accountRows.find((account) => account.name === "Checking"))
  throw new Error("Checking account missing");
if (!payeeRows.find((payee) => payee.name === "Woolworths"))
  throw new Error("Woolworths payee missing");
if (
  !payeeRows.find(
    (payee) => payee.isTransfer && payee.name === "Transfer : Savings",
  )
)
  throw new Error("Transfer payee missing");
if (
  !transactionRows.find(
    (transaction) =>
      transaction.type === "Transfer" && transaction.transferAccountId,
  )
)
  throw new Error("Transfer transaction missing target account");
if (
  !transactionRows.find(
    (transaction) => transaction.clearedStatus === "Reconciled",
  )
)
  throw new Error("Reconciled status not imported");
if (
  splitRows.length !== 1 ||
  flagRows.length !== 1 ||
  noteRows.length < 3 ||
  budgetMonthRows.length !== 1 ||
  categoryMonthRows.length !== 2
)
  throw new Error("Import child records missing");

console.log(
  "PASS: v1.2.3 imports YNAB4 accounts, categories, payees, transactions, transfers, splits, flags, notes, and budget months",
);
