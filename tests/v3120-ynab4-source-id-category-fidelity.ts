import { readSeededTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
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
  masterCategories: [
    {
      entityId: "current-group",
      name: "Current",
      subCategories: [{ entityId: "current-utilities", name: "Utilities" }],
    },
    {
      entityId: "MasterCategory/__Hidden__",
      name: "Hidden Categories",
      subCategories: [
        { entityId: "historical-utilities", name: "Old Home ` Utilities ` old-home" },
        { entityId: "referenced-tombstone", name: "Old Home ` Legacy Service ` old-home", isTombstone: true },
        { entityId: "orphan-tombstone", name: "Old Home ` Unused Category ` old-home", isTombstone: true },
      ],
    },
  ],
  payees: [{ entityId: "supplier", name: "Supplier" }],
  monthlyBudgets: [{
    entityId: "month-2020-01",
    month: "2020-01-01",
    monthlySubCategoryBudgets: [
      { entityId: "budget-hidden", categoryId: "historical-utilities", budgeted: 100 },
      { entityId: "budget-current", categoryId: "current-utilities", budgeted: 200 },
      { entityId: "budget-tombstone", subCategoryId: "referenced-tombstone", budgeted: 50 },
      { entityId: "deleted-budget-row", categoryId: "orphan-tombstone", budgeted: 999, isTombstone: true },
    ],
  }],
  transactions: [
    { entityId: "hidden-spend", accountId: "checking", date: "2020-01-10", amount: -25, categoryId: "historical-utilities", payeeId: "supplier" },
    { entityId: "legacy-spend", accountId: "checking", date: "2020-01-11", amount: -10, subCategoryId: "referenced-tombstone", payeeId: "supplier" },
  ],
  scheduledTransactions: [],
};

const entries: Ynab4PackageEntry[] = [
  { path: "Generic.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
  { path: "Generic.ynab4/data/Budget.yfull", text: JSON.stringify(source) },
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

const raw = (() => { const view = readBudgetMonthEntity(storage, result.budget.id, "2020-01"); return view ? JSON.stringify(view) : null; })();
assert.ok(raw);
const view = JSON.parse(raw) as {
  categoryGroups: Array<{ name: string; categories: Array<{ name: string; assigned: number; activity: number; isArchived: boolean }> }>;
};
const current = view.categoryGroups.find((group) => group.name === "Current")?.categories.find((category) => category.name === "Utilities");
const hidden = view.categoryGroups.find((group) => group.name === "Hidden Categories")?.categories;
const historical = hidden?.find((category) => category.name === "Old Home/Utilities");
const referencedTombstone = hidden?.find((category) => category.name.includes("Legacy Service"));

assert.ok(current);
assert.equal(current.assigned, 200);
assert.equal(current.activity, 0, "An active category with the same display name must not receive hidden-category activity.");
assert.ok(historical);
assert.equal(historical.isArchived, true);
assert.equal(historical.assigned, 100);
assert.equal(historical.activity, -25, "Activity must remain attached to the exact YNAB4 source category ID.");
assert.equal(referencedTombstone, undefined, "Actual-compatible imports must not revive referenced tombstoned categories.");
assert.equal(hidden?.some((category) => category.name.includes("Unused Category")), false, "Unreferenced tombstones should not be imported.");

const importerSource = await import("node:fs").then(({ readFileSync }) => readFileSync("apps/web/src/features/budget/ynab4LauncherImport.ts", "utf8"));
assert.doesNotMatch(
  importerSource,
  /categoryKey\s*===\s*["']mortgage["']/i,
);
assert.doesNotMatch(
  importerSource,
  /findSingleActiveCategoryIdByNamePrefix/,
);
assert.doesNotMatch(
  importerSource,
  /suppressDuplicateArchivedCategories/,
);

assert.ok(result.record.accuracyAudit, "The launcher import must produce an accuracy audit.");
assert.equal(
  result.record.accuracyAudit.status,
  "pass",
  "The audit must apply the same non-tombstoned category policy as the importer.",
);
assert.equal(
  result.record.accuracyAudit.warnings.some((warning) => warning.includes("Legacy Service")),
  false,
  "Skipped tombstoned categories must not be reported as missing budget fidelity.",
);

const registers = readSeededTransactionRegisters(createFixedBudgetScopedStorage(storage, result.budget.id));
const transactions = Object.values(registers).flatMap((register) => register.transactions);
assert.equal(
  transactions.find((transaction) => transaction.id === "legacy-spend")?.category,
  "Uncategorised",
  "Transactions that reference tombstoned categories must remain unresolved rather than being redirected by name.",
);

console.log("v3.13 Actual-compatible YNAB4 category semantics passed");
