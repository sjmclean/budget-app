import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_BUDGET_PREFERENCES } from "../../../apps/web/src/features/budget/budgetPreferences.js";
import type { BudgetSummary } from "../../../apps/web/src/features/budget/budgetRegistry.js";
import { buildYnab4LauncherImportPlan } from "../../../apps/web/src/features/budget/ynab4LauncherImport.js";

const fixtureUrl = new URL(
  "../../fixtures/ynab4/conformance/Budget-19-comprehensive.yfull",
  import.meta.url,
);

function createBudget(): BudgetSummary {
  return {
    id: "ynab4-real-export-conformance",
    name: "YNAB4 Real Export Conformance",
    currency: "AUD",
    preferences: DEFAULT_BUDGET_PREFERENCES,
    lastOpenedLabel: "Not opened yet",
    packagePath: "~/Budgets/YNAB4RealExportConformance.budget",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  };
}

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as Record<string, unknown>;
}

test("imports the comprehensive real YNAB4 export without losing source semantics", () => {
  const plan = buildYnab4LauncherImportPlan(
    createBudget(),
    loadFixture(),
    new Date("2026-07-21T00:00:00.000Z"),
  );

  const closedAccount = plan.accounts.find((account) => account.name === "New Account");
  assert.ok(closedAccount);
  assert.equal(closedAccount.closedAt, "2026-07-21T00:00:00.000Z");

  const trackingAccount = plan.accounts.find((account) => account.name === "Tracking");
  assert.ok(trackingAccount);
  assert.equal(trackingAccount.type, "tracking");

  const hiddenCategories = [...plan.budgetMonths.values()][0]?.categoryGroups
    .flatMap((group) => group.categories)
    .filter((category) => category.isArchived);
  assert.deepEqual(
    hiddenCategories?.map((category) => category.name).sort(),
    ["Everyday Expenses/Groceries", "Everyday Expenses/Spending Money"],
  );

  const allTransactions = Object.values(plan.registers).flatMap(
    (register) => register.transactions,
  );
  assert.ok(allTransactions.some((transaction) => transaction.reconciled));

  const categorisedTrackingTransfer = allTransactions.find(
    (transaction) =>
      transaction.transferAccountId === trackingAccount.id &&
      transaction.categoryId !== undefined,
  );
  assert.ok(categorisedTrackingTransfer);
  assert.equal(categorisedTrackingTransfer.category, "Charitable");

  const scheduledTrackingTransfer = plan.scheduledTransactions.find(
    (transaction) =>
      transaction.payee === "Transfer: Tracking" && transaction.outflow === 50,
  );
  assert.ok(scheduledTrackingTransfer);
  assert.equal(scheduledTrackingTransfer.category, "Charitable");
  assert.ok(scheduledTrackingTransfer.categoryId);
});
