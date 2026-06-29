import assert from "node:assert/strict";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()].sort();
    },
  };
}

const entries: Ynab4PackageEntry[] = [
  {
    path: "Sortable Test.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data" }),
  },
  {
    path: "Sortable Test.ynab4/data/DEVICE/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ entityId: "account-1", name: "Checking", onBudget: true }],
      payees: [],
      transactions: [{ entityId: "txn-1", accountId: "account-1", date: "2026-06-01", amount: 0 }],
      scheduledTransactions: [],
      masterCategories: [
        {
          entityId: "hidden-group",
          name: "Hidden Categories",
          sortableIndex: -1073741824,
          subCategories: [
            { entityId: "hidden-beta", name: "Old Group ` Hidden Beta ` old-group", sortableIndex: 20 },
            { entityId: "hidden-alpha", name: "Old Group ` Hidden Alpha ` old-group", sortableIndex: 10 },
          ],
        },
        {
          entityId: "zebra-group",
          name: "Zebra Group",
          sortableIndex: 30,
          subCategories: [
            { entityId: "zebra-third", name: "Zebra Third", sortableIndex: 300 },
            { entityId: "zebra-first", name: "Zebra First", sortableIndex: 100 },
            { entityId: "zebra-second", name: "Zebra Second", sortableIndex: 200 },
          ],
        },
        {
          entityId: "alpha-group",
          name: "Alpha Group",
          sortableIndex: 10,
          subCategories: [
            { entityId: "alpha-second", name: "Alpha Second", sortableIndex: 2 },
            { entityId: "alpha-first", name: "Alpha First", sortableIndex: 1 },
          ],
        },
        {
          entityId: "middle-group",
          name: "Middle Group",
          sortableIndex: 20,
          subCategories: [
            { entityId: "middle-only", name: "Middle Only", sortableIndex: 0 },
          ],
        },
      ],
      monthlyBudgets: [{ entityId: "month-1", month: "2026-06", monthlySubCategoryBudgets: [] }],
    }),
  },
];

function importBudgetView(): BudgetMonthView {
  const storage = createMemoryStorage();
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-29T00:00:00.000Z"),
  });
  const raw = storage.getItem(`budget-app.budget-view.v1.${result.budget.id}.2026-06`);
  assert.ok(raw);
  return JSON.parse(raw) as BudgetMonthView;
}

const view = importBudgetView();

assert.deepEqual(
  view.categoryGroups.map((group) => group.name),
  ["Alpha Group", "Middle Group", "Zebra Group", "Hidden Categories"],
);

assert.deepEqual(
  view.categoryGroups.find((group) => group.name === "Alpha Group")?.categories.map((category) => category.name),
  ["Alpha First", "Alpha Second"],
);
assert.deepEqual(
  view.categoryGroups.find((group) => group.name === "Zebra Group")?.categories.map((category) => category.name),
  ["Zebra First", "Zebra Second", "Zebra Third"],
);
assert.deepEqual(
  view.categoryGroups.find((group) => group.name === "Hidden Categories")?.categories.map((category) => category.name),
  ["Hidden Alpha", "Hidden Beta"],
);
assert.equal(
  view.categoryGroups.find((group) => group.name === "Hidden Categories")?.categories.every((category) => category.isArchived),
  true,
);

console.log("v2.34.1 YNAB4 category sortableIndex fidelity passed");
