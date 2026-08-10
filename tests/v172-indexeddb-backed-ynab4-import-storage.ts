import assert from "node:assert/strict";
import {
  createYnab4LauncherBudgetImportWithBackend,
} from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import { readBudgetRegistry } from "../apps/web/src/features/budget/budgetRegistry.ts";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import type {
  Ynab4PackageDiscoveryResult,
  Ynab4PackageEntry,
  Ynab4PackageMigrationPreview,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

class MemoryBackendStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();
  public flushed = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }

  async flush(): Promise<void> {
    this.flushed = true;
  }
}

class FailingFlushBackendStorage extends MemoryBackendStorage {
  async flush(): Promise<void> {
    throw new Error("backend write failed");
  }
}

function createEntries(transactionCount: number): Ynab4PackageEntry[] {
  const transactions = Array.from({ length: transactionCount }, (_, index) => ({
    entityId: `transaction-${index}`,
    accountId: "account-1",
    payeeId: "payee-1",
    categoryId: "category-1",
    date: "2020-12-01",
    amount: -1000,
    memo: `Imported transaction ${index}`,
    cleared: true,
  }));

  const budgetData = {
    accounts: [{ entityId: "account-1", name: "Cheque", accountType: "Checking", onBudget: true }],
    masterCategories: [{
      entityId: "group-1",
      name: "Everyday",
      subCategories: [{ entityId: "category-1", name: "Groceries" }],
    }],
    payees: [{ entityId: "payee-1", name: "Supermarket" }],
    transactions,
    scheduledTransactions: [],
    monthlyBudgets: [{
      month: "2020-12",
      monthlySubCategoryBudgets: [{ categoryId: "category-1", budgeted: 100000, activity: -transactionCount * 1000, balance: 0 }],
    }],
  };

  return [
    {
      path: "My Budget.ynab4/Budget.ymeta",
      text: JSON.stringify({ relativeDataFolderName: "data1~ABC" }),
    },
    {
      path: "My Budget.ynab4/data1~ABC/Budget.yfull",
      text: JSON.stringify(budgetData),
    },
  ];
}

function createDiscovery(transactionCount: number): Ynab4PackageDiscoveryResult {
  return {
    isYnab4Package: true,
    packageRoot: "My Budget.ynab4",
    budgetName: "My Budget",
    metadataPath: "My Budget.ynab4/Budget.ymeta",
    relativeDataFolderName: "data1~ABC",
    activeDataFolderPath: "My Budget.ynab4/data1~ABC",
    budgetDataPath: "My Budget.ynab4/data1~ABC/Budget.yfull",
    budgetDataFormat: "yfull",
    topLevelKeys: [],
    counts: {
      accounts: 1,
      masterCategories: 1,
      categories: 1,
      payees: 1,
      monthlyBudgets: 1,
      transactions: transactionCount,
      scheduledTransactions: 0,
      categoryNotes: 0,
      categoryGroupNotes: 0,
    },
    warnings: [],
    progressSteps: [],
    details: {
      accounts: [],
      categoryGroups: [],
      payees: [],
      scheduledTransactions: [],
      firstTransactions: [],
      recentTransactions: [],
      notes: { categoryNotes: [], categoryGroupNotes: [] },
      previewLimits: {
        accounts: 0,
        categoryGroups: 0,
        categoriesPerGroup: 0,
        payees: 0,
        scheduledTransactions: 0,
        notes: 0,
        transactionSamples: 0,
      },
    },
  };
}

function createPreview(): Ynab4PackageMigrationPreview {
  return {
    mode: "new-budget",
    destructive: false,
    canContinue: true,
    budgetName: "My Budget",
    summaryItems: [],
    warnings: [],
    progressSteps: [],
    details: {
      accounts: [],
      categoryGroups: [],
      payees: [],
      scheduledTransactions: [],
      firstTransactions: [],
      recentTransactions: [],
      notes: { categoryNotes: [], categoryGroupNotes: [] },
      previewLimits: {
        accounts: 0,
        categoryGroups: 0,
        categoriesPerGroup: 0,
        payees: 0,
        scheduledTransactions: 0,
        notes: 0,
        transactionSamples: 0,
      },
    },
  };
}

{
  const storage = new MemoryBackendStorage();
  const transactionCount = 1500;
  const result = await createYnab4LauncherBudgetImportWithBackend(storage, {
    discovery: createDiscovery(transactionCount),
    preview: createPreview(),
    entries: createEntries(transactionCount),
    now: new Date("2026-06-24T00:00:00.000Z"),
  });

  assert.equal(storage.flushed, true);
  assert.equal(result.record.schemaVersion, 2);
  assert.equal(result.record.streamingImport?.audit.status, "pass");
}

{
  const storage = new FailingFlushBackendStorage();
  await assert.rejects(
    () => createYnab4LauncherBudgetImportWithBackend(storage, {
      discovery: createDiscovery(10),
      preview: createPreview(),
      entries: createEntries(10),
      now: new Date("2026-06-24T00:00:00.000Z"),
    }),
    /backend write failed/,
  );

  const registryAfterFailure = readBudgetRegistry(storage);
  assert.equal(
    registryAfterFailure.some((budget) => budget.id.includes("oversized-import")),
    false,
  );
  assert.equal(
    storage.listKeys().some((key) => key.includes("oversized-import")),
    false,
  );
}

console.log("v1.72 IndexedDB-backed YNAB4 import storage tests passed");
