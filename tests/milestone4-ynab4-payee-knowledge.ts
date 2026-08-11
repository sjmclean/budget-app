import assert from "node:assert/strict";
import { DEFAULT_BUDGET_PREFERENCES } from "../apps/web/src/features/budget/budgetPreferences.js";
import { buildYnab4LauncherImportPlan } from "../apps/web/src/features/budget/ynab4LauncherImport.js";
import { resolvePayeeRecognition } from "../apps/web/src/features/accounts/payeeRecognition.js";

const plan = buildYnab4LauncherImportPlan({
  id: "knowledge-budget", name: "Knowledge", currency: "AUD",
  preferences: DEFAULT_BUDGET_PREFERENCES, lastOpenedLabel: "Never",
  createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
}, {
  accounts: [{ entityId: "account-1", accountName: "Cheque", onBudget: true }],
  masterCategories: [{
    entityId: "group-1", name: "Living", type: "OUTFLOW",
    subCategories: [
      { entityId: "category-groceries", name: "Groceries" },
      { entityId: "category-utilities", name: "Utilities" },
    ],
  }],
  payees: [
    {
      entityId: "payee-grocer", name: "Grocer", autoFillCategoryId: "category-groceries",
      autoFillMemo: "out of scope", autoFillAmount: -123,
      renameConditions: [
        { entityType: "payeeStringCondition", entityId: "condition-is", parentPayeeId: "payee-grocer", operator: "Is", operand: "GROCER 1234" },
        { entityType: "payeeStringCondition", entityId: "condition-contains", parentPayeeId: "payee-grocer", operator: "Contains", operand: "GROCER METRO" },
        { entityType: "payeeStringCondition", entityId: "condition-deleted", parentPayeeId: "payee-grocer", operator: "Contains", operand: "DELETED", isTombstone: true },
        { entityType: "payeeStringCondition", entityId: "condition-unsupported", parentPayeeId: "payee-grocer", operator: "StartsWith", operand: "NOPE" },
      ],
    },
    { entityId: "payee-income", name: "Employer", autoFillCategoryId: "Category/__ImmediateIncome__" },
    { entityId: "payee-missing", name: "Missing", autoFillCategoryId: "category-does-not-exist" },
    { entityId: "payee-a", name: "Conflict A", renameConditions: [
      { entityId: "conflict-a", parentPayeeId: "payee-a", operator: "Contains", operand: "AMBIGUOUS SHOP" },
    ] },
    { entityId: "payee-b", name: "Conflict B", renameConditions: [
      { entityId: "conflict-b", parentPayeeId: "payee-b", operator: "Contains", operand: "AMBIGUOUS SHOP" },
      { entityId: "unresolved-target", parentPayeeId: "deleted-payee", operator: "Is", operand: "ORPHAN" },
    ] },
  ],
  transactions: [{
    entityId: "transaction-1", accountId: "account-1", payeeId: "payee-grocer",
    categoryId: "category-utilities", date: "2026-08-01", amount: -25,
  }],
  scheduledTransactions: [], monthlyBudgets: [],
}, new Date("2026-08-10T00:00:00.000Z"));

const grocer = plan.payees.find(({ name }) => name === "Grocer")!;
assert.equal(grocer.defaultCategoryName, "Groceries");
assert.ok(grocer.defaultCategoryId);
assert.deepEqual(grocer.importRules?.map(({ matchType, text }) => [matchType, text]), [
  ["equals", "GROCER 1234"], ["contains", "GROCER METRO"],
]);
assert.equal(resolvePayeeRecognition("GROCER 1234", plan.payees).match?.payee.id, grocer.id);
assert.equal(resolvePayeeRecognition("CARD GROCER METRO MELBOURNE", plan.payees).match?.payee.id, grocer.id);
assert.equal(resolvePayeeRecognition("DELETED", plan.payees).match, null);
assert.equal(resolvePayeeRecognition("AMBIGUOUS SHOP", plan.payees).match, null);

const employer = plan.payees.find(({ name }) => name === "Employer")!;
assert.equal(employer.defaultCategoryId, "__ready_to_assign__");
assert.equal(employer.defaultCategoryName, "Ready to Assign");

const importedTransaction = plan.registers[plan.accounts[0].id].transactions[0];
assert.equal(importedTransaction.category, "Utilities", "historical category must not be replaced by the payee default");
assert.equal(importedTransaction.categoryId === grocer.defaultCategoryId, false);

assert.deepEqual(plan.payeeKnowledgeAudit?.defaults, {
  sourcePayeesWithDefaultCategory: 3,
  importedPayeeDefaultCategories: 2,
  specialDefaultCategoryMappings: 1,
  unresolvedDefaultCategories: 1,
});
assert.deepEqual(plan.payeeKnowledgeAudit?.renameConditions, {
  total: 7, active: 6, tombstoned: 1, imported: 2, deduplicated: 0,
  conflicting: 2, unsupported: 1, unresolvedTarget: 1,
});
assert.deepEqual(
  new Set(plan.payeeKnowledgeAudit?.diagnostics.map(({ code }) => code)),
  new Set(["unresolved-default-category", "unsupported-rename-operator", "unresolved-rename-target", "conflicting-rename-condition"]),
);

console.log("Milestone 4 YNAB4 payee knowledge migration passed.");
