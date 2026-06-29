import { createBudgetRegistryEntry, readBudgetRegistry } from "../apps/web/src/features/budget/budgetRegistry.js";
import { getBudgetScopedStorageKey, SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.js";
import {
  createVersionHistorySnapshotAfterYnab4Import,
  createVersionHistorySnapshotBeforeBudgetSwitch,
} from "../apps/web/src/features/budget/versionHistoryLifecycle.js";
import {
  listVersionHistorySnapshots,
  readVersionHistorySnapshotPackage,
} from "../apps/web/src/features/budget/versionHistory.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
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

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

const storage = new MemoryStorage();
const household = readBudgetRegistry(storage)[0]!;
const business = createBudgetRegistryEntry(storage, {
  name: "Business Budget",
  now: new Date("2026-06-29T08:00:00.000Z"),
});

const householdAccountsKey = getBudgetScopedStorageKey(household.id, "budget-app.accounts.v1");
const businessAccountsKey = getBudgetScopedStorageKey(business.id, "budget-app.accounts.v1");

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);
storage.setItem(householdAccountsKey, JSON.stringify([{ id: "everyday", name: "Everyday" }]));
storage.setItem(businessAccountsKey, JSON.stringify([{ id: "business", name: "Business" }]));

const sameBudget = createVersionHistorySnapshotBeforeBudgetSwitch(storage, household.id, {
  now: new Date("2026-06-29T09:00:00.000Z"),
});
assertEqual(sameBudget.created, false, "opening the active budget should not create a duplicate snapshot");
assertEqual(sameBudget.skippedReason, "The selected budget is already active.");

const switchSnapshot = createVersionHistorySnapshotBeforeBudgetSwitch(storage, business.id, {
  now: new Date("2026-06-29T10:00:00.000Z"),
});
assertEqual(switchSnapshot.created, true, "switching budgets should snapshot the outgoing budget");
assertEqual(switchSnapshot.event, "budget-switch");
assertEqual(switchSnapshot.snapshot?.budgetId, household.id);
assertEqual(switchSnapshot.snapshot?.source, "automatic");

const packageBeforeSwitch = readVersionHistorySnapshotPackage(storage, switchSnapshot.snapshot!.id, household.id);
assertOk(packageBeforeSwitch, "budget switch snapshot should be readable");
assertEqual(
  packageBeforeSwitch.budgetPackage.budget.id,
  household.id,
  "budget switch snapshot should package the outgoing selected budget",
);

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, business.id);
const importSnapshot = createVersionHistorySnapshotAfterYnab4Import(storage, {
  now: new Date("2026-06-29T11:00:00.000Z"),
});
assertEqual(importSnapshot.created, true, "successful import lifecycle should snapshot the imported active budget");
assertEqual(importSnapshot.event, "ynab4-import-completed");
assertEqual(importSnapshot.snapshot?.budgetId, business.id);

assertDeepEqual(
  listVersionHistorySnapshots(storage, household.id).map((snapshot) => snapshot.id),
  [switchSnapshot.snapshot!.id],
  "household should retain only its outgoing-budget snapshot",
);
assertDeepEqual(
  listVersionHistorySnapshots(storage, business.id).map((snapshot) => snapshot.id),
  [importSnapshot.snapshot!.id],
  "business should retain only its import-completed snapshot",
);

const commandHistoryKeys = storage.listKeys().filter((key) => key.includes("command-history") || key.includes("undo"));
assertDeepEqual(
  commandHistoryKeys,
  [],
  "version history lifecycle snapshots must not write command-history or undo/redo records",
);

console.log("v2.33.1 data protection lifecycle checks passed");

function assertOk(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message = "Expected values to be equal"): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message = "Expected values to be deeply equal"): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
