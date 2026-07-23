import assert from "node:assert/strict";

import { buildYnab4LauncherImportPlan } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { BudgetSummary } from "../apps/web/src/features/budget/budgetRegistry.ts";

const budget: BudgetSummary = {
  id: "budget-ynab4-deleted-category",
  name: "YNAB4 deleted category",
  currency: "AUD",
  dateFormat: "DD/MM/YYYY",
  numberFormat: "1,234.56",
  firstDayOfWeek: "monday",
  preferences: { creditCardBehaviour: "normal" },
  packagePath: "DeletedCategory.ynab4.budget",
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  lastOpenedLabel: "Opened just now",
};

const plan = buildYnab4LauncherImportPlan(
  budget,
  {
    accounts: [
      { entityId: "account", accountName: "Checking", onBudget: true },
      { entityId: "deleted-account", accountName: "Deleted", onBudget: true, isDeleted: true },
    ],
    masterCategories: [
      {
        entityId: "group",
        name: "Everyday",
        type: "OUTFLOW",
        subCategories: [
          { entityId: "live-category", name: "Groceries" },
          { entityId: "deleted-category", name: "Old category", isDeleted: true },
        ],
      },
    ],
    payees: [],
    transactions: [
      {
        entityId: "ordinary-deleted-category",
        accountId: "account",
        date: "2026-07-01",
        amount: -10,
        categoryId: "deleted-category",
      },
      {
        entityId: "deleted-transaction",
        accountId: "account",
        date: "2026-07-02",
        amount: -50,
        categoryId: "live-category",
        isDeleted: true,
      },
    ],
    scheduledTransactions: [
      {
        entityId: "scheduled-deleted-category",
        accountId: "account",
        date: "2026-08-01",
        amount: -15,
        categoryId: "deleted-category",
        frequency: "monthly",
      },
      {
        entityId: "deleted-schedule",
        accountId: "account",
        date: "2026-08-02",
        amount: -20,
        categoryId: "live-category",
        frequency: "monthly",
        isDeleted: true,
      },
    ],
    monthlyBudgets: [],
  },
  new Date("2026-07-23T00:00:00.000Z"),
);

assert.equal(plan.accounts.some(account => account.name === "Deleted"), false);
const transactions = Object.values(plan.registers).flatMap(register => register.transactions);
assert.equal(transactions.length, 1);
assert.equal(transactions[0].category, "Uncategorised");
assert.equal(transactions[0].categoryId, undefined);
assert.equal(plan.scheduledTransactions.length, 1);
assert.equal(plan.scheduledTransactions[0].category, "Uncategorised");
assert.equal(plan.scheduledTransactions[0].categoryId, undefined);
assert.equal(
  plan.warnings.filter(warning => warning.includes("deleted-category")).length,
  2,
);
assert.equal(
  plan.warnings.some(warning => warning.includes("Ready to Assign")),
  false,
);

console.log("v3.23.7 YNAB4 deleted-category safety passed");
