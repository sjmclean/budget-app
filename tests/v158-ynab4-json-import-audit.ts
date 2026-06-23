import assert from "node:assert/strict";
import {
  analyseYnab4JsonText,
  createYnab4JsonImportPlan,
  isRegisterTransactionImportFileName,
  isYnab4JsonImportFileName,
} from "../packages/ynab4-importer/src/analyzeYnab4Json.js";

function testRejectsCsvAsYnab4MigrationSource() {
  const result = analyseYnab4JsonText("Date,Payee,Amount\n2026-06-01,Coles,-42.50");

  assert.equal(result.isJson, false);
  assert.equal(result.isPotentialYnab4Json, false);
  assert.match(result.warnings[0], /JSON data file/);
}

function testDetectsPotentialYnab4JsonSections() {
  const result = analyseYnab4JsonText(
    JSON.stringify({
      accounts: [],
      categoryGroups: [],
      payees: [],
      transactions: [],
      scheduledTransactions: [],
    }),
  );

  assert.equal(result.isJson, true);
  assert.equal(result.rootKind, "object");
  assert.equal(result.isPotentialYnab4Json, true);
  assert.deepEqual(result.detectedSections.sort(), [
    "accounts",
    "categoryGroups",
    "payees",
    "scheduledTransactions",
    "transactions",
  ]);
}

function testImportAsNewBudgetPlan() {
  const plan = createYnab4JsonImportPlan("new-budget", "budget-launcher");

  assert.equal(plan.destructive, false);
  assert.equal(plan.createsBudget, true);
  assert.equal(plan.requiresExistingBudget, false);
  assert.ok(plan.progressSteps.length >= 10);
  assert.equal(plan.progressSteps.at(-1)?.phase, "complete");
}

function testReplaceCurrentBudgetPlan() {
  const plan = createYnab4JsonImportPlan("replace-current-budget", "reset-replace");

  assert.equal(plan.destructive, true);
  assert.equal(plan.createsBudget, false);
  assert.equal(plan.requiresExistingBudget, true);
  assert.ok(plan.progressSteps.some((step) => step.phase === "prepare-target-budget"));
}

function testFileBoundaries() {
  assert.equal(isRegisterTransactionImportFileName("statement.csv"), true);
  assert.equal(isRegisterTransactionImportFileName("budget.json"), false);
  assert.equal(isYnab4JsonImportFileName("Budget.yNAB4"), true);
  assert.equal(isYnab4JsonImportFileName("Budget.json"), true);
  assert.equal(isYnab4JsonImportFileName("Register.csv"), false);
}

function run() {
  testRejectsCsvAsYnab4MigrationSource();
  testDetectsPotentialYnab4JsonSections();
  testImportAsNewBudgetPlan();
  testReplaceCurrentBudgetPlan();
  testFileBoundaries();
  console.log("v1.58 YNAB4 JSON import audit tests passed");
}

run();
