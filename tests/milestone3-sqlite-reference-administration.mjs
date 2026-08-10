import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import { createBudgetReferenceDataStore } from "../apps/server/src/budgetReferenceDataStore.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
const importer = createBudgetImportStore(database, engine);
const references = createBudgetReferenceDataStore(database, engine);
const session = importer.begin({
  budgetId: "budget-1",
  budgetName: "Reference Test",
  currency: "AUD",
});
importer.persistReferenceData(session.generationId, {
  accounts: [{
    id: "account-1", name: "Everyday", type: "on-budget",
    participation: "budget", openingBalance: 0, closedAt: null,
  }],
  payees: [
    { id: "payee-source", name: "Old Shop" },
    { id: "payee-target", name: "New Shop" },
  ],
  categories: [
    { id: "food", name: "Food", groupId: "living", groupName: "Living", sortOrder: 0 },
    { id: "rent", name: "Rent", groupId: "living", groupName: "Living", sortOrder: 1 },
  ],
});
for (const month of ["2026-06", "2026-07"]) {
  importer.persistBudgetMonths(session.generationId, [{
    month,
    view: {
      budgetId: "budget-1",
      budgetName: "Reference Test",
      monthLabel: month,
      currencyCode: "AUD",
      readyToAssign: 0,
      totalAssigned: 300,
      totalActivity: -100,
      totalAvailable: 200,
      categoryGroups: [{
        id: "living", name: "Living", previousAvailable: 0,
        assigned: 300, activity: -100, available: 200, note: "",
        categories: [
          {
            id: "food", name: "Food", previousAvailable: 0, assigned: 100,
            activity: -100, available: 0, isOverspent: false,
            isArchived: false, note: "",
          },
          {
            id: "rent", name: "Rent", previousAvailable: 0, assigned: 200,
            activity: 0, available: 200, isOverspent: false,
            isArchived: false, note: "",
          },
        ],
      }],
    },
  }]);
}
importer.persistTransactions(session.generationId, [{
  id: "transaction-1", accountId: "account-1", payeeId: "payee-source",
  categoryId: "food", transferAccountId: null, transferTransactionId: null,
  type: "standard", date: "2026-07-01", memo: null, checkNumber: null,
  amount: -100, clearedStatus: "cleared", createdAt: 1, updatedAt: 1,
  splitLines: [],
}]);
importer.validate(session.generationId);
importer.commit(session.generationId);

const afterCreate = references.createAccount("budget-1", {
  name: "Savings", type: "tracking", startingBalance: 12_345,
});
const savings = afterCreate.accounts.find((account) => account.name === "Savings");
assert.ok(savings);
assert.equal(savings.type, "tracking");
assert.equal(savings.openingBalance, 12_345);

const afterRename = references.updateAccount("budget-1", savings.id, {
  name: "Investments", type: "tracking",
});
assert.ok(afterRename.accounts.some((account) => account.name === "Investments"));
assert.equal(references.deleteAccount("budget-1", savings.id).deleted, true);
assert.equal(references.deleteAccount("budget-1", "account-1").deleted, false);

let payees = references.updatePayee("budget-1", "payee-target", {
  name: "Preferred Shop",
  note: "Use for groceries",
  defaultCategoryId: "food",
  defaultCategoryName: "Living: Food",
  importRules: [{ id: "rule-1", matchType: "contains", text: "preferred" }],
});
assert.equal(payees.find((payee) => payee.id === "payee-target").note, "Use for groceries");
payees = references.createPayee("budget-1", { name: "Inline Payee" });
assert.ok(payees.some((payee) => payee.name === "Inline Payee"));
assert.equal(
  references.createPayee("budget-1", { name: "inline payee" })
    .filter((payee) => payee.name.toLowerCase() === "inline payee").length,
  1,
  "inline payee creation must be case-insensitively idempotent",
);
payees = references.updatePayee("budget-1", "payee-target", {
  name: "Preferred Store",
});
const partiallyUpdatedPayee = payees.find((payee) => payee.id === "payee-target");
assert.equal(partiallyUpdatedPayee.note, "Use for groceries");
assert.equal(partiallyUpdatedPayee.defaultCategoryId, "food");
assert.equal(partiallyUpdatedPayee.importRules.length, 1);
references.setPayeeArchived("budget-1", "payee-target", true);
assert.ok(references.listPayees("budget-1", true).some((payee) => payee.id === "payee-target"));
references.setPayeeArchived("budget-1", "payee-target", false);
payees = references.mergePayees("budget-1", "payee-source", "payee-target");
assert.ok(payees.some((payee) => payee.id === "payee-target"));
assert.equal(
  database.prepare(`
    SELECT payee_id FROM budget_import_transactions
    WHERE generation_id = ? AND id = 'transaction-1'
  `).get(session.generationId).payee_id,
  "payee-target",
);
assert.ok(references.listPayees("budget-1", true).some((payee) => payee.id === "payee-source"));

engine.addTransaction({
  budgetId: "budget-1",
  accountId: "account-1",
  transaction: {
    id: "transaction-new-payee",
    date: "2026-07-02",
    amount: -50,
    payeeName: "Brand New Payee",
  },
});
assert.ok(
  references.listPayees("budget-1", false)
    .some((payee) => payee.name === "Brand New Payee" && payee.useCount === 1),
  "typing a new payee must create and link a hosted payee",
);

references.mutateCategory("budget-1", {
  operation: "rename", month: "2026-07", categoryId: "food", name: "Groceries",
});
for (const month of ["2026-06", "2026-07"]) {
  assert.equal(
    engine.getBudgetMonthView("budget-1", month)
      .categoryGroups[0].categories.find((category) => category.id === "food").name,
    "Groceries",
  );
}

const created = references.mutateCategory("budget-1", {
  operation: "create", month: "2026-07", name: "Fuel",
  groupId: "living", groupName: "Living",
});
assert.ok(created.createdCategoryId);
for (const month of ["2026-06", "2026-07"]) {
  assert.ok(
    engine.getBudgetMonthView("budget-1", month)
      .categoryGroups[0].categories.some((category) => category.id === created.createdCategoryId),
  );
}

references.mutateCategory("budget-1", {
  operation: "category-note", month: "2026-07", categoryId: "rent", note: "Monthly lease",
});
references.mutateCategory("budget-1", {
  operation: "merge", month: "2026-07", categoryId: "food", targetCategoryId: "rent",
});
assert.equal(
  database.prepare(`
    SELECT category_id FROM budget_import_transactions
    WHERE generation_id = ? AND id = 'transaction-1'
  `).get(session.generationId).category_id,
  "rent",
);
for (const month of ["2026-06", "2026-07"]) {
  const view = engine.getBudgetMonthView("budget-1", month);
  assert.equal(
    view.categoryGroups[0].categories.find((category) => category.id === "food").isArchived,
    true,
  );
  assert.equal(
    view.categoryGroups[0].categories.find((category) => category.id === "rent").note,
    "Monthly lease",
  );
}

database.close();
console.log("Milestone 3 SQLite reference administration passed across all stored months.");
