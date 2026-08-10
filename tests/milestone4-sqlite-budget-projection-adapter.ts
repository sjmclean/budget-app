import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyBudgetProjectionToSnapshot,
  diagnoseSqliteBudgetProjection,
  toDisplayUnits,
  toMinorUnits,
} from "../apps/web/src/features/persistence/localFirst/sqliteBudgetProjectionAdapter.ts";

const snapshot = {
  budgetId: "budget",
  budgetName: "Budget",
  monthLabel: "July 2026",
  currencyCode: "AUD",
  readyToAssign: 50,
  totalAssigned: 50,
  totalActivity: -20,
  totalAvailable: 30,
  categoryGroups: [{
    id: "living",
    name: "Living",
    previousAvailable: 0,
    assigned: 50,
    activity: -20,
    available: 30,
    note: "",
    categories: [{
      id: "internet",
      name: "Internet",
      previousAvailable: 0,
      assigned: 50,
      activity: -20,
      available: 30,
      isOverspent: false,
      isArchived: false,
      overspendingHandling: "reduce-next-month" as const,
      note: "",
    }],
  }],
};

const facts = {
  budgetId: "budget",
  fromMonth: "2026-07",
  throughMonth: "2026-07",
  targetMonth: "2026-07",
  readyToAssignCategoryId: "__ready_to_assign__",
  openingReadyToAssign: 0,
  accounts: [
    { id: "checking", participation: "on-budget" as const },
    { id: "tracking", participation: "off-budget" as const },
  ],
  categories: [{
    id: "internet",
    groupId: "living",
    overspendingPolicy: "reduce-next-month" as const,
  }],
  assignments: [{ month: "2026-07", categoryId: "internet", amount: 5_000 }],
  transactions: [
    { id: "income", accountId: "checking", date: "2026-07-01", categoryId: "__ready_to_assign__", amount: 10_000 },
    { id: "expense", accountId: "checking", date: "2026-07-02", categoryId: "internet", amount: -2_000 },
    { id: "ignored", accountId: "tracking", date: "2026-07-03", categoryId: "internet", amount: -9_999 },
  ],
  snapshot,
};

const matching = diagnoseSqliteBudgetProjection(facts);
assert.equal(matching.matchesSnapshot, true);
assert.deepEqual(matching.differences, []);
assert.equal(matching.projection.available, 3_000);
const authoritative = applyBudgetProjectionToSnapshot(
  { ...snapshot, totalActivity: -999, totalAvailable: -999 },
  matching.projection,
);
assert.equal(authoritative.totalActivity, -20);
assert.equal(authoritative.totalAvailable, 30);
assert.equal(authoritative.categoryGroups[0]!.categories[0]!.available, 30);
assert.equal(toDisplayUnits(5_436), 54.36);

const changed = diagnoseSqliteBudgetProjection({
  ...facts,
  transactions: facts.transactions.map((transaction) =>
    transaction.id === "expense" ? { ...transaction, amount: -2_500 } : transaction
  ),
});
assert.equal(changed.matchesSnapshot, false);
assert.deepEqual(
  changed.differences.map(({ path, deltaMinor }) => ({ path, deltaMinor })),
  [
    { path: "totalActivity", deltaMinor: -500 },
    { path: "totalAvailable", deltaMinor: -500 },
    { path: "categories.internet.activity", deltaMinor: -500 },
    { path: "categories.internet.available", deltaMinor: -500 },
  ],
);
assert.equal(toMinorUnits(54.36), 5_436);
assert.throws(() => toMinorUnits(Number.NaN), /must be finite/);

const worker = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);
assert.match(worker, /CREATE TABLE IF NOT EXISTS local_budget_category_policies/);
assert.match(worker, /normaliseBudgetMonthProjectionFacts\(entityId, payload, updatedAt\)/);
assert.match(worker, /case "getBudgetProjectionDiagnostic"/);
assert.match(worker, /diagnoseSqliteBudgetProjection/);

const runtime = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", import.meta.url),
  "utf8",
);
assert.match(runtime, /BUDGET_ENGINE_DIAGNOSTIC_STORAGE_KEY/);
assert.match(runtime, /if \(!diagnostic\.matchesSnapshot\)/);
assert.match(runtime, /return view;/);

console.log("Milestone 4 SQLite budget projection adapter passed: normalized facts, exact comparison, diagnostic isolation, and snapshot authority.");
