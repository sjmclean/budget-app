import assert from "node:assert/strict";
import {
  writeYnab4LauncherImportPlanBulk,
  type Ynab4LauncherImportPlan,
} from "../apps/web/src/features/budget/ynab4LauncherImport.js";
import type {
  KeyValueStorageMutation,
  KeyValueStoragePort,
} from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class BulkCaptureStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();
  readonly batches: KeyValueStorageMutation[][] = [];
  directWrites = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    this.directWrites += 1;
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()]; }
  async applyMutations(mutations: readonly KeyValueStorageMutation[]) {
    this.batches.push([...mutations]);
    for (const mutation of mutations) {
      if (mutation.type === "set") this.values.set(mutation.key, mutation.value);
      else this.values.delete(mutation.key);
    }
  }
}

const view = {
  budgetId: "bulk-budget",
  month: "2025-01",
  income: 0,
  assigned: 0,
  activity: 0,
  readyToBudget: 0,
  categoryGroups: [{
    id: "living",
    name: "Living",
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    categories: [{
      id: "food",
      name: "Food",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      isOverspent: false,
    }],
  }],
};

const plan = {
  budgetId: "bulk-budget",
  accounts: [{
    id: "checking",
    name: "Checking",
    type: "on-budget",
    startingBalance: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    closedAt: null,
  }],
  payees: Array.from({ length: 4_501 }, (_, index) => ({
    id: `payee-${index}`,
    name: `Payee ${index}`,
    createdAt: "2025-01-01T00:00:00.000Z",
    lastUsedAt: "2025-01-01T00:00:00.000Z",
    useCount: 1,
    isArchived: false,
  })),
  transactionTags: [],
  registers: {},
  scheduledTransactions: [],
  budgetMonths: new Map(
    Array.from({ length: 120 }, (_, index) => {
      const year = 2015 + Math.floor(index / 12);
      const month = String((index % 12) + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      return [key, { ...view, month: key }];
    }),
  ),
  warnings: [],
} as unknown as Ynab4LauncherImportPlan;

const storage = new BulkCaptureStorage();
const mutationCount = await writeYnab4LauncherImportPlanBulk(storage, plan);
assert.equal(storage.batches.length, 1);
assert.equal(storage.directWrites, 0);
assert.equal(storage.batches[0].length, mutationCount);
assert.ok(mutationCount > 4_500);
assert.ok(mutationCount < 4_700);

const categoryRecordWrites = storage.batches[0].filter(
  (mutation) =>
    mutation.type === "set" &&
    (mutation.key.includes("/category/") ||
      mutation.key.includes("/category-group/")),
);
assert.equal(
  categoryRecordWrites.length,
  2,
  "Static category entities must be rendered once, not once per budget month.",
);

console.log(
  `Milestone 3 compatibility finalisation passed: ${mutationCount} records in one storage batch.`,
);

