import assert from "node:assert/strict";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  readBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry.ts";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";
import { readBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";

function createQuotaStorage(failingKeyPart: string): KeyValueStoragePort {
  const values = new Map<string, string>();
  let hasFailed = false;

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (!hasFailed && key.includes(failingKeyPart)) {
        hasFailed = true;
        throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
      }
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
    path: "Family Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Family Budget.ynab4/data1/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        { accountId: "checking", name: "Cheque", accountType: "Checking" },
        { accountId: "closed", name: "Old Savings", accountType: "Savings", closed: true },
      ],
      masterCategories: [
        {
          masterCategoryId: "everyday",
          name: "Everyday",
          subCategories: [{ entityId: "groceries", name: "Groceries" }],
        },
      ],
      payees: [{ entityId: "p1", name: "Shop" }],
      monthlyBudgets: [
        {
          entityId: "mb1",
          month: "2026-06",
          monthlySubCategoryBudgets: [
            { categoryId: "groceries", budgeted: 250000, activity: -120000, balance: 130000 },
          ],
        },
      ],
      transactions: [
        { entityId: "t1", accountId: "checking", payeeId: "p1", categoryId: "groceries", date: "2026-06-01", amount: -1000 },
        { entityId: "t2", accountId: "closed", payeeId: "p1", categoryId: "groceries", date: "2026-06-02", amount: -2000 },
      ],
      scheduledTransactions: [],
    }),
  },
];

function preparePreview() {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  return { discovery, preview };
}

function assertNoImportedBudgetRemains(storage: KeyValueStoragePort) {
  const keys = storage.listKeys?.() ?? [];
  assert.equal(keys.some((key) => key.includes("family-budget-imported")), false);
  assert.equal(keys.some((key) => key.includes("ynab4-launcher-import")), false);
  assert.equal(readBudgetRegistry(storage).some((budget) => budget.name === "Family Budget Imported"), false);
}

function testRegisterQuotaFailureRollsBackBudgetRegistryAndData() {
  const storage = createQuotaStorage("budget-app.entity-replication.v1/transaction/");
  const existing = createBudgetRegistryEntry(storage, {
    name: "Household",
    now: new Date("2026-06-24T00:00:00.000Z"),
  });
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, existing.id);
  const registryBefore = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBefore = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const { discovery, preview } = preparePreview();

  assert.throws(
    () => createYnab4LauncherBudgetImport(storage, {
      discovery,
      preview,
      entries,
      now: new Date("2026-06-24T01:00:00.000Z"),
    }),
    /No budget was created and no partial data was saved/,
  );

  assert.equal(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY), registryBefore);
  assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), selectedBefore);
  assertNoImportedBudgetRemains(storage);
}

function testBudgetViewQuotaFailureRollsBackBudgetRegistryAndData() {
  const storage = createQuotaStorage("budget-app.entity-replication.v1/budget-month/");
  const existing = createBudgetRegistryEntry(storage, {
    name: "Household",
    now: new Date("2026-06-24T00:00:00.000Z"),
  });
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, existing.id);
  const registryBefore = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBefore = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const { discovery, preview } = preparePreview();

  assert.throws(
    () => createYnab4LauncherBudgetImport(storage, {
      discovery,
      preview,
      entries,
      now: new Date("2026-06-24T01:05:00.000Z"),
    }),
    /No budget was created and no partial data was saved/,
  );

  assert.equal(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY), registryBefore);
  assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), selectedBefore);
  assertNoImportedBudgetRemains(storage);
}

testRegisterQuotaFailureRollsBackBudgetRegistryAndData();
testBudgetViewQuotaFailureRollsBackBudgetRegistryAndData();

console.log("v1.71.6 atomic YNAB4 launcher import tests passed");
