import { browserLocalStorageBudgetActivityPersistence } from "../apps/web/src/features/persistence/browserLocalStorageBudgetActivityPersistence.js";

const ACCOUNT_STORAGE_KEY = "budget-app.accounts.v1";
const REGISTER_STORAGE_KEY = "budget-app.account-registers.v1";
const SCHEDULED_TRANSACTIONS_STORAGE_KEY = "budget-app.scheduled-transactions.v1";

class MemoryLocalStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const localStorage = new MemoryLocalStorage();
(globalThis as typeof globalThis & { window: { localStorage: MemoryLocalStorage } }).window = {
  localStorage,
};

localStorage.setItem(
  ACCOUNT_STORAGE_KEY,
  JSON.stringify([
    {
      id: "checking",
      name: "Checking",
      type: "on-budget",
      startingBalance: 0,
      createdAt: "2026-06-20T00:00:00.000Z",
      closedAt: null,
    },
    {
      id: "tracking-house",
      name: "House",
      type: "tracking",
      startingBalance: 0,
      createdAt: "2026-06-20T00:00:00.000Z",
      closedAt: null,
    },
  ]),
);

localStorage.setItem(
  REGISTER_STORAGE_KEY,
  JSON.stringify({
    checking: {
      accountType: "on-budget",
      transactions: [
        {
          id: "tx-groceries",
          date: "2026-06-20",
          category: "Groceries",
          categoryId: "cat-groceries",
          inflow: 0,
          outflow: 4500,
          splitLines: [
            {
              id: "split-fuel",
              category: "Fuel",
              categoryId: "cat-fuel",
              inflow: 0,
              outflow: 1200,
            },
            {
              id: "split-groceries",
              category: "Groceries",
              categoryId: "cat-groceries",
              inflow: 0,
              outflow: 3300,
            },
          ],
        },
      ],
    },
    "tracking-house": {
      accountType: "tracking",
      transactions: [
        {
          id: "tx-tracking",
          date: "2026-06-20",
          category: "House Value",
          categoryId: "cat-house-value",
          inflow: 0,
          outflow: 1,
        },
      ],
    },
  }),
);

localStorage.setItem(
  SCHEDULED_TRANSACTIONS_STORAGE_KEY,
  JSON.stringify([
    {
      id: "scheduled-groceries",
      category: "Groceries",
      categoryId: "cat-groceries",
    },
    {
      id: "scheduled-fuel",
      category: "Fuel",
      categoryId: "cat-fuel",
    },
  ]),
);

const listed = await browserLocalStorageBudgetActivityPersistence.listRegisterTransactionsForBudgetActivity();
if (listed.length !== 1) {
  throw new Error(`Expected tracking accounts to be excluded from budget activity, got ${listed.length}`);
}
if (listed[0].accountId !== "checking") {
  throw new Error(`Expected checking transaction to be listed, got ${listed[0].accountId}`);
}

const groceryCounts = await browserLocalStorageBudgetActivityPersistence.countCategoryReferences({
  id: "cat-groceries",
  name: "Groceries",
});

if (groceryCounts.registerTransactionCount !== 1) {
  throw new Error(`Expected 1 grocery register transaction, got ${groceryCounts.registerTransactionCount}`);
}
if (groceryCounts.registerSplitLineCount !== 1) {
  throw new Error(`Expected 1 grocery split line, got ${groceryCounts.registerSplitLineCount}`);
}
if (groceryCounts.scheduledTransactionCount !== 1) {
  throw new Error(`Expected 1 grocery scheduled transaction, got ${groceryCounts.scheduledTransactionCount}`);
}

await browserLocalStorageBudgetActivityPersistence.rewriteCategoryReferences({
  sourceCategory: { id: "cat-groceries", name: "Groceries" },
  targetCategory: { id: "cat-household", name: "Household" },
});

const rewrittenCounts = await browserLocalStorageBudgetActivityPersistence.countCategoryReferences({
  id: "cat-household",
  name: "Household",
});

if (rewrittenCounts.registerTransactionCount !== 1) {
  throw new Error("Expected rewritten register transaction category reference");
}
if (rewrittenCounts.registerSplitLineCount !== 1) {
  throw new Error("Expected rewritten register split category reference");
}
if (rewrittenCounts.scheduledTransactionCount !== 1) {
  throw new Error("Expected rewritten scheduled transaction category reference");
}

await browserLocalStorageBudgetActivityPersistence.renameRegisterCategoryReferences({
  previousName: "Fuel",
  nextName: "Car Fuel",
});

const renamedCounts = await browserLocalStorageBudgetActivityPersistence.countCategoryReferences({
  id: "cat-fuel",
  name: "Car Fuel",
});

if (renamedCounts.registerSplitLineCount !== 1) {
  throw new Error("Expected register split category name rename to preserve categoryId reference");
}
if (renamedCounts.scheduledTransactionCount !== 1) {
  throw new Error("Expected scheduled Fuel category reference to remain unchanged by register-only rename");
}

console.log("v1.27 budget activity persistence port checks OK");
