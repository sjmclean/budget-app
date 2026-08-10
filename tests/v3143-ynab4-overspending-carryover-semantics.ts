import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";
import { readBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    listKeys: () => [...values.keys()].sort(),
  };
}

const source = {
  accounts: [{ entityId: "checking", accountName: "Checking", accountType: "Checking", onBudget: true }],
  masterCategories: [{
    entityId: "everyday",
    name: "Everyday",
    subCategories: [
      { entityId: "confined", name: "Confined category" },
      { entityId: "buffer", name: "Buffer category" },
      { entityId: "positive", name: "Positive category" },
    ],
  }],
  payees: [{ entityId: "merchant", name: "Merchant" }],
  monthlyBudgets: [
    {
      entityId: "month-2020-01",
      month: "2020-01-01",
      monthlySubCategoryBudgets: [
        { entityId: "jan-confined", categoryId: "confined", budgeted: 50, overspendingHandling: "Confined" },
        { entityId: "jan-buffer", categoryId: "buffer", budgeted: 20, overspendingHandling: "AffectsBuffer" },
        { entityId: "jan-positive", categoryId: "positive", budgeted: 100 },
      ],
    },
    {
      entityId: "month-2020-02",
      month: "2020-02-01",
      monthlySubCategoryBudgets: [
        { entityId: "feb-confined", categoryId: "confined", budgeted: 0, overspendingHandling: "Confined" },
        { entityId: "feb-buffer", categoryId: "buffer", budgeted: 0, overspendingHandling: "AffectsBuffer" },
        { entityId: "feb-positive", categoryId: "positive", budgeted: 0 },
      ],
    },
  ],
  transactions: [
    { entityId: "spend-confined", accountId: "checking", date: "2020-01-10", amount: -100, categoryId: "confined", payeeId: "merchant" },
    { entityId: "spend-buffer", accountId: "checking", date: "2020-01-11", amount: -70, categoryId: "buffer", payeeId: "merchant" },
    { entityId: "spend-positive", accountId: "checking", date: "2020-01-12", amount: -75, categoryId: "positive", payeeId: "merchant" },
  ],
  scheduledTransactions: [],
};

const entries: Ynab4PackageEntry[] = [
  { path: "Carryover.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
  { path: "Carryover.ynab4/data/Budget.yfull", text: JSON.stringify(source) },
];
const storage = createMemoryStorage();
const discovery = discoverYnab4Package(entries);
const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
assert.equal(preview.canContinue, true);
const result = createYnab4LauncherBudgetImport(storage, {
  discovery,
  preview,
  entries,
  now: new Date("2026-07-15T00:00:00.000Z"),
});
assert.equal(result.record.accuracyAudit?.status, "pass");

function readCategory(month: string, name: string) {
  const raw = readBudgetMonthEntity(storage, result.budget.id, month);
  assert.ok(raw);
  const view = raw as {
    categoryGroups: Array<{
      categories: Array<{
        name: string;
        previousAvailable: number;
        assigned: number;
        activity: number;
        available: number;
      }>;
    }>;
  };
  const category = view.categoryGroups.flatMap((group) => group.categories).find((item) => item.name === name);
  assert.ok(category);
  return category;
}

const januaryConfined = readCategory("2020-01", "Confined category");
assert.equal(januaryConfined.available, -50);
const januaryBuffer = readCategory("2020-01", "Buffer category");
assert.equal(januaryBuffer.available, -50);
const januaryPositive = readCategory("2020-01", "Positive category");
assert.equal(januaryPositive.available, 25);

const februaryConfined = readCategory("2020-02", "Confined category");
assert.equal(februaryConfined.previousAvailable, -50, "Confined overspending must carry into the next month.");
assert.equal(februaryConfined.available, -50);

const februaryBuffer = readCategory("2020-02", "Buffer category");
assert.equal(februaryBuffer.previousAvailable, 0, "AffectsBuffer overspending must not carry as category debt.");
assert.equal(februaryBuffer.available, 0);

const februaryPositive = readCategory("2020-02", "Positive category");
assert.equal(februaryPositive.previousAvailable, 25, "Positive balances must continue to roll forward without an explicit flag.");
assert.equal(februaryPositive.available, 25);


console.log("v3.14.3 YNAB4 overspending carryover semantics passed");
