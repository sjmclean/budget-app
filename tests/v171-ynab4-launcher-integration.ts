import assert from "node:assert/strict";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  readBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry.ts";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.ts";
import {
  createYnab4LauncherBudgetImport,
  getYnab4LauncherImportStorageKey,
  readYnab4LauncherImportRecord,
} from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
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

function createRegisterQuotaStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  let rejectedRegisterWrite = false;

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (!rejectedRegisterWrite && key.includes("budget-app.account-registers.v1")) {
        rejectedRegisterWrite = true;
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
        { accountId: "visa", name: "Visa", accountType: "CreditCard" },
      ],
      masterCategories: [
        {
          masterCategoryId: "bills",
          name: "Bills",
          note: "Group note",
          subCategories: [
            { entityId: "rent", name: "Rent", note: "Category note" },
          ],
        },
      ],
      payees: [{ entityId: "p1", name: "Landlord" }],
      monthlyBudgets: [{ entityId: "mb1", month: "2026-06" }],
      transactions: [
        { entityId: "t1", accountId: "checking", payeeId: "p1", amount: -120000 },
      ],
      scheduledTransactions: [
        { entityId: "s1", accountId: "checking", payeeId: "p1", amount: -120000 },
      ],
    }),
  },
];

function preparePreview() {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  return { discovery, preview };
}

function testLauncherImportCreatesNewBudgetAndKeepsExistingBudgets() {
  const storage = createMemoryStorage();
  const existing = createBudgetRegistryEntry(storage, {
    name: "Household",
    now: new Date("2026-06-20T10:00:00.000Z"),
  });
  const before = readBudgetRegistry(storage);
  const { discovery, preview } = preparePreview();

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-23T11:00:00.000Z"),
  });

  assert.equal(result.budget.name, "Family Budget Imported");
  assert.notEqual(result.budget.id, existing.id);
  assert.equal(result.budgets.length, before.length + 1);
  assert.equal(readBudgetRegistry(storage).some((budget) => budget.id === existing.id), true);
  assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), result.budget.id);
}

function testLauncherImportStoresMigrationSummaryForImportedBudget() {
  const storage = createMemoryStorage();
  const { discovery, preview } = preparePreview();

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-23T11:05:00.000Z"),
  });

  const raw = storage.getItem(getYnab4LauncherImportStorageKey(result.budget.id));
  assert.ok(raw);
  const record = readYnab4LauncherImportRecord(storage, result.budget.id);
  assert.ok(record);
  assert.equal(record.budgetId, result.budget.id);
  assert.equal(record.mode, "new-budget");
  assert.equal(record.status, "completed");
  assert.equal(record.sourceBudgetName, "Family Budget");
  assert.equal(record.counts.accounts, 2);
  assert.equal(record.counts.categoryGroups, 1);
  assert.equal(record.counts.categories, 1);
  assert.equal(record.counts.transactions, 1);
  assert.equal(record.counts.scheduledTransactions, 1);
  assert.equal(record.progressSteps.some((step) => step.phase === "import-transactions"), true);
}

function testLauncherImportRejectsInvalidPreview() {
  const storage = createMemoryStorage();
  const discovery = discoverYnab4Package([{ path: "notes.txt", text: "not a budget" }]);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");

  assert.throws(
    () => createYnab4LauncherBudgetImport(storage, { discovery, preview, entries: [] }),
    /preview validation passes/,
  );

  assert.equal(readBudgetRegistry(storage).length, 1);
  assert.ok(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY));
}

function testLauncherImportPersistsImportedBudgetData() {
  const storage = createMemoryStorage();
  const { discovery, preview } = preparePreview();

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-23T11:10:00.000Z"),
  });

  const scopedPrefix = `budget-app.budgets.${result.budget.id}.`;
  const accountsRaw = storage.getItem(`${scopedPrefix}budget-app.accounts.v1`);
  const registersRaw = storage.getItem(`${scopedPrefix}budget-app.account-registers.v1`);
  const payeesRaw = storage.getItem(`${scopedPrefix}budget-app.payees.v1`);
  const scheduledRaw = storage.getItem(`${scopedPrefix}budget-app.scheduled-transactions.v1`);
  const budgetViewRaw = storage.getItem(`budget-app.budget-view.v1.${result.budget.id}.2026-06`);

  assert.ok(accountsRaw);
  assert.ok(registersRaw);
  assert.ok(payeesRaw);
  assert.ok(scheduledRaw);
  assert.ok(budgetViewRaw);

  const accounts = JSON.parse(accountsRaw);
  const registers = JSON.parse(registersRaw);
  const payees = JSON.parse(payeesRaw);
  const scheduled = JSON.parse(scheduledRaw);
  const budgetView = JSON.parse(budgetViewRaw);

  assert.equal(accounts.length, 2);
  assert.equal(accounts.some((account: any) => account.name === "Cheque"), true);
  assert.equal(accounts.some((account: any) => account.name === "Visa" && account.type === "credit-card"), true);
  assert.equal(payees.length, 1);
  assert.equal(payees[0].name, "Landlord");
  assert.equal(registers.cheque.transactions.length, 1);
  assert.equal(registers.cheque.transactions[0].payee, "Landlord");
  assert.equal(scheduled.length, 1);
  assert.equal(budgetView.categoryGroups.length, 1);
  assert.equal(budgetView.categoryGroups[0].name, "Bills");
  assert.equal(budgetView.categoryGroups[0].categories[0].name, "Rent");
}


function testLauncherImportFallsBackWhenRegisterStorageExceedsQuota() {
  const storage = createRegisterQuotaStorage();
  const transactions = Array.from({ length: 1_250 }, (_, index) => ({
    entityId: `large-${index}`,
    accountId: "checking",
    payeeId: "p1",
    date: `2026-06-${String((index % 28) + 1).padStart(2, "0")}`,
    amount: -1000,
    memo: `Imported history transaction ${index}`,
  }));
  const largeEntries: Ynab4PackageEntry[] = [
    entries[0],
    {
      path: "Family Budget.ynab4/data1/Budget.yfull",
      text: JSON.stringify({
        accounts: [
          { accountId: "checking", name: "Cheque", accountType: "Checking" },
        ],
        masterCategories: [],
        payees: [{ entityId: "p1", name: "Shop" }],
        monthlyBudgets: [{ entityId: "mb1", month: "2026-06" }],
        transactions,
        scheduledTransactions: [],
      }),
    },
  ];
  const discovery = discoverYnab4Package(largeEntries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries: largeEntries,
    now: new Date("2026-06-23T11:20:00.000Z"),
  });

  const scopedPrefix = `budget-app.budgets.${result.budget.id}.`;
  const accountsRaw = storage.getItem(`${scopedPrefix}budget-app.accounts.v1`);
  const registersRaw = storage.getItem(`${scopedPrefix}budget-app.account-registers.v1`);
  const record = readYnab4LauncherImportRecord(storage, result.budget.id);

  assert.ok(accountsRaw);
  assert.ok(registersRaw);
  assert.ok(record);
  assert.equal(record.warnings.some((warning) => warning.includes("browser localStorage quota was exceeded")), true);

  const registers = JSON.parse(registersRaw);
  assert.equal(registers.cheque.transactions.length, 1000);
}

function run() {
  testLauncherImportCreatesNewBudgetAndKeepsExistingBudgets();
  testLauncherImportStoresMigrationSummaryForImportedBudget();
  testLauncherImportPersistsImportedBudgetData();
  testLauncherImportFallsBackWhenRegisterStorageExceedsQuota();
  testLauncherImportRejectsInvalidPreview();
  console.log("v1.71 YNAB4 launcher integration tests passed");
}

run();
