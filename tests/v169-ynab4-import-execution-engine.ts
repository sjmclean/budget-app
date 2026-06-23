import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../packages/database/src/db.js";
import {
  accounts,
  budgetMonths,
  budgets,
  categories,
  categoryGroups,
  categoryMonths,
  importMaps,
  importRuns,
  payees,
  scheduledTransactions,
  transactions,
} from "../packages/database/src/schema.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { TransactionType } from "../packages/types/src/TransactionType.js";
import { executeYnab4PackageImportToNewBudget } from "../packages/ynab4-importer/src/executeYnab4PackageImport.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v169-"));
try {
  const db = createDatabase(join(tempDir, "v169.sqlite"));
  const existingBudgetId = "existing-budget";
  db.insert(budgets).values({
    id: existingBudgetId,
    name: "Existing Budget",
    currency: "AUD",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  }).run();

  const result = executeYnab4PackageImportToNewBudget(
    db,
    [
      {
        path: "Household.ynab4/Budget.ymeta",
        text: JSON.stringify({ relativeDataFolderName: "data1-AAAA" }),
      },
      {
        path: "Household.ynab4/data1-AAAA/budget-guid/Budget.yfull",
        text: JSON.stringify({
          accounts: [
            {
              entityId: "acct-cheque",
              accountName: "Cheque Account",
              accountType: "Checking",
              onBudget: true,
              balance: 123400,
            },
            {
              entityId: "acct-visa",
              accountName: "Visa Card",
              accountType: "CreditCard",
              onBudget: true,
              balance: -4250,
            },
            {
              entityId: "acct-super",
              accountName: "Super Fund",
              accountType: "Investment",
              onBudget: false,
              balance: 5000000,
            },
          ],
          masterCategories: [
            {
              entityId: "group-everyday",
              name: "Everyday Expenses",
              subCategories: [
                { entityId: "cat-groceries", name: "Groceries" },
                { entityId: "cat-fuel", name: "Fuel" },
              ],
            },
          ],
          payees: [
            { entityId: "payee-coles", name: "Coles" },
            { entityId: "payee-transfer-visa", name: "Transfer : Visa Card", targetAccountId: "acct-visa" },
            { entityId: "payee-transfer-cheque", name: "Transfer : Cheque Account", targetAccountId: "acct-cheque" },
          ],
          transactions: [
            {
              entityId: "txn-payment-source",
              accountId: "acct-cheque",
              payeeId: "payee-transfer-visa",
              targetAccountId: "acct-visa",
              transferTransactionId: "txn-payment-target",
              amount: -25000,
              date: "2026-01-12",
              memo: "Card payment",
            },
            {
              entityId: "txn-payment-target",
              accountId: "acct-visa",
              payeeId: "payee-transfer-cheque",
              targetAccountId: "acct-cheque",
              transferTransactionId: "txn-payment-source",
              amount: 25000,
              date: "2026-01-12",
            },
            {
              entityId: "txn-card-spend",
              accountId: "acct-visa",
              payeeId: "payee-coles",
              categoryId: "cat-groceries",
              amount: -4250,
              date: "2026-01-13",
              checkNumber: "103",
              memo: "Weekly shop",
              cleared: "cleared",
            },
          ],
          scheduledTransactions: [
            {
              entityId: "sched-card-payment",
              accountId: "acct-cheque",
              payeeId: "payee-transfer-visa",
              targetAccountId: "acct-visa",
              amount: -10000,
              nextDueDate: "2026-02-01",
              frequency: "monthly",
            },
          ],
          monthlyBudgets: [
            {
              entityId: "MB/2026-01",
              month: "2026-01-01",
              monthlySubCategoryBudgets: [
                {
                  entityId: "MCB/2026-01/cat-groceries",
                  categoryId: "cat-groceries",
                  budgeted: 125.55,
                  activity: -42.5,
                  balance: 83.05,
                },
                {
                  entityId: "MCB/2026-01/cat-fuel",
                  categoryId: "cat-fuel",
                  budgeted: 40.2,
                  outflows: 15,
                  balance: 25.2,
                },
              ],
            },
          ],
        }),
      },
    ],
    { currency: "AUD", userId: "local-user", now: new Date("2026-01-20T00:00:00.000Z") },
  );

  assert.equal(result.status, "completed");
  assert.equal(result.budgetName, "Household");
  assert.notEqual(result.budgetId, existingBudgetId, "YNAB4 execution must create a new budget rather than overwrite the current one");
  assert.equal(result.created.budgets, 1);
  assert.equal(result.created.accounts, 3);
  assert.equal(result.created.categoryGroups, 1);
  assert.equal(result.created.categories, 2);
  assert.equal(result.created.payees, 3);
  assert.equal(result.created.transactions, 3);
  assert.equal(result.created.scheduledTransactions, 1);
  assert.equal(result.created.budgetMonths, 1);
  assert.equal(result.created.categoryMonths, 2);
  assert.equal(result.skipped.transactions, 0);
  assert.equal(result.skipped.scheduledTransactions, 0);
  assert.equal(result.skipped.categoryMonths, 0);
  assert.equal(result.skipped.transferPayeesAsOrdinaryPayees, 2);

  const allBudgets = db.select().from(budgets).all();
  assert.equal(allBudgets.length, 2);
  assert.ok(allBudgets.some((budget) => budget.id === existingBudgetId && budget.name === "Existing Budget"));
  assert.ok(allBudgets.some((budget) => budget.id === result.budgetId && budget.name === "Household"));

  const importedAccounts = db.select().from(accounts).where(eq(accounts.budgetId, result.budgetId)).all();
  assert.equal(importedAccounts.length, 3);
  const visa = importedAccounts.find((account) => account.name === "Visa Card");
  assert.ok(visa);
  assert.equal(visa.type, AccountType.CreditCard);
  assert.equal(visa.participation, BudgetParticipation.OnBudget);
  const superFund = importedAccounts.find((account) => account.name === "Super Fund");
  assert.ok(superFund);
  assert.equal(superFund.participation, BudgetParticipation.OffBudget);

  const importedGroups = db.select().from(categoryGroups).where(eq(categoryGroups.budgetId, result.budgetId)).all();
  assert.equal(importedGroups.length, 1);
  const importedCategories = db.select().from(categories).where(eq(categories.groupId, importedGroups[0].id)).all();
  assert.deepEqual(importedCategories.map((category) => category.name).sort(), ["Fuel", "Groceries"]);

  const importedPayees = db.select().from(payees).where(eq(payees.budgetId, result.budgetId)).all();
  assert.equal(importedPayees.filter((payee) => payee.isTransfer).length, 2);
  assert.equal(importedPayees.filter((payee) => !payee.isTransfer).length, 1);
  assert.ok(importedPayees.find((payee) => payee.name === "Transfer : Visa Card" && payee.transferAccountId === visa.id));

  const importedTransactions = db.select().from(transactions).where(eq(transactions.budgetId, result.budgetId)).all();
  assert.equal(importedTransactions.length, 3);
  assert.equal(importedTransactions.filter((transaction) => transaction.type === TransactionType.Transfer).length, 2);
  const cardPurchase = importedTransactions.find((transaction) => transaction.amount === -4250);
  assert.ok(cardPurchase);
  assert.equal(cardPurchase.type, TransactionType.Standard);
  assert.equal(cardPurchase.checkNumber, "103");
  assert.ok(cardPurchase.categoryId, "credit-card purchase should preserve its spending category");

  const importedSchedules = db.select().from(scheduledTransactions).where(eq(scheduledTransactions.budgetId, result.budgetId)).all();
  assert.equal(importedSchedules.length, 1);
  assert.equal(importedSchedules[0].type, TransactionType.Transfer);
  assert.equal(importedSchedules[0].nextDueDate, "2026-02-01");

  const importedBudgetMonths = db.select().from(budgetMonths).where(eq(budgetMonths.budgetId, result.budgetId)).all();
  assert.equal(importedBudgetMonths.length, 1);
  assert.equal(importedBudgetMonths[0].month, "2026-01");
  assert.equal(importedBudgetMonths[0].assigned, 16575);
  const importedCategoryMonths = db.select().from(categoryMonths).where(eq(categoryMonths.budgetMonthId, importedBudgetMonths[0].id)).all();
  assert.equal(importedCategoryMonths.length, 2);
  assert.equal(importedCategoryMonths.reduce((sum, row) => sum + row.assigned, 0), 16575);

  const run = db.select().from(importRuns).where(eq(importRuns.id, result.importRunId)).get();
  assert.ok(run);
  assert.equal(run.budgetId, result.budgetId);
  const maps = db.select().from(importMaps).where(eq(importMaps.importRunId, result.importRunId)).all();
  assert.equal(maps.length, result.created.importMaps);
  assert.ok(maps.some((row) => row.sourceEntityId === "acct-visa" && row.targetEntityType === "account"));

  console.log("v1.69 YNAB4 import execution engine passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
