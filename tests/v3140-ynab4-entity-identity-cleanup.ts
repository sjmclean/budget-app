import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

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
  accounts: [
    {
      entityId: "checking-source",
      accountId: "checking-alias",
      accountName: "Checking",
      accountType: "Checking",
      onBudget: true,
    },
  ],
  masterCategories: [
    {
      entityId: "shared-group",
      masterCategoryId: "shared-group-alias",
      name: "Everyday",
      subCategories: [
        {
          entityId: "alpha-source",
          categoryId: "alpha-alias",
          masterCategoryId: "shared-group",
          name: "Alpha",
        },
        {
          entityId: "beta-source",
          subCategoryId: "beta-alias",
          masterCategoryId: "shared-group",
          name: "Beta",
        },
      ],
    },
  ],
  payees: [
    {
      entityId: "merchant-source",
      payeeId: "merchant-alias",
      accountId: "checking-source",
      name: "Merchant",
    },
  ],
  monthlyBudgets: [
    {
      entityId: "month-2020-01",
      month: "2020-01-01",
      monthlySubCategoryBudgets: [
        { entityId: "budget-alpha", categoryId: "alpha-source", budgeted: 100 },
        { entityId: "budget-beta", subCategoryId: "beta-source", budgeted: 200 },
      ],
    },
  ],
  transactions: [
    {
      entityId: "alpha-spend",
      accountId: "checking-source",
      date: "2020-01-10",
      amount: -10,
      categoryId: "alpha-source",
      payeeId: "merchant-source",
    },
    {
      entityId: "relationship-id-spend",
      accountId: "checking-source",
      date: "2020-01-11",
      amount: -5,
      categoryId: "shared-group",
      payeeId: "merchant-source",
    },
  ],
  scheduledTransactions: [],
};

const entries: Ynab4PackageEntry[] = [
  {
    path: "Identity.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data" }),
  },
  {
    path: "Identity.ynab4/data/Budget.yfull",
    text: JSON.stringify(source),
  },
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

const monthRaw = storage.getItem(
  `budget-app.budget-view.v1.${result.budget.id}.2020-01`,
);
assert.ok(monthRaw);
const month = JSON.parse(monthRaw) as {
  categoryGroups: Array<{
    categories: Array<{
      name: string;
      assigned: number;
      activity: number;
    }>;
  }>;
};
const categories = month.categoryGroups.flatMap((group) => group.categories);
const alpha = categories.find((category) => category.name === "Alpha");
const beta = categories.find((category) => category.name === "Beta");
assert.ok(alpha);
assert.ok(beta);
assert.equal(alpha.assigned, 100);
assert.equal(alpha.activity, -10);
assert.equal(beta.assigned, 200);
assert.equal(
  beta.activity,
  0,
  "A sibling category must not inherit activity through its shared masterCategoryId.",
);

const registerRaw = storage.getItem(
  getBudgetScopedStorageKey(
    result.budget.id,
    "budget-app.account-registers.v1",
  ),
);
assert.ok(registerRaw);
const registers = JSON.parse(registerRaw) as Record<
  string,
  {
    transactions: Array<{
      id: string;
      category: string;
      categoryId?: string;
      payee: string;
    }>;
  }
>;
const transactions = Object.values(registers).flatMap(
  (register) => register.transactions,
);
const relationshipIdSpend = transactions.find(
  (transaction) => transaction.id === "relationship-id-spend",
);
assert.ok(relationshipIdSpend);
assert.equal(
  relationshipIdSpend.category,
  "Ready to Assign",
  "A masterCategoryId relationship must never be registered as a category identity alias.",
);
assert.equal(
  transactions.find((transaction) => transaction.id === "alpha-spend")?.payee,
  "Merchant",
);

const importerSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);
const auditSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts",
  "utf8",
);
assert.doesNotMatch(importerSource, /function sourceIds\s*\(/);
assert.doesNotMatch(auditSource, /function sourceIds\s*\(/);
assert.match(importerSource, /function ownEntitySourceIds\s*\(/);
assert.match(auditSource, /function ownEntitySourceIds\s*\(/);

console.log("v3.14.0 YNAB4 entity identity cleanup passed");
