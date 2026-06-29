import {
  collectVersionHistoryStorageKeys,
  createVersionHistorySnapshot,
  deleteVersionHistorySnapshot,
  listVersionHistorySnapshots,
  readVersionHistorySnapshotPackage,
  restoreVersionHistorySnapshot,
} from "../apps/web/src/features/budget/versionHistory.js";
import { createBudgetRegistryEntry, readBudgetRegistry } from "../apps/web/src/features/budget/budgetRegistry.js";
import { getBudgetScopedStorageKey, SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.js";
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
  currency: "AUD",
  now: new Date("2026-06-29T08:00:00.000Z"),
});

const accountsKey = getBudgetScopedStorageKey(household.id, "budget-app.accounts.v1");
const payeesKey = getBudgetScopedStorageKey(household.id, "budget-app.payees.v1");
const businessAccountsKey = getBudgetScopedStorageKey(business.id, "budget-app.accounts.v1");

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);
storage.setItem(accountsKey, JSON.stringify([{ id: "everyday", name: "Everyday" }]));
storage.setItem(payeesKey, JSON.stringify([{ id: "grocer", name: "Grocer" }]));
storage.setItem("budget-app.budget-view.v1.household.2026-06", JSON.stringify({ readyToAssign: 25 }));
storage.setItem(businessAccountsKey, JSON.stringify([{ id: "business", name: "Business" }]));

const first = createVersionHistorySnapshot(storage, {
  now: new Date("2026-06-29T09:00:00.000Z"),
  snapshotId: "snapshot-1",
  retentionLimit: 3,
});
assertEqual(first.created, true, "automatic snapshot should be created");
assertEqual(first.snapshot?.source, "automatic");
assertEqual(first.retainedSnapshots, 1);

storage.setItem(accountsKey, JSON.stringify([{ id: "everyday", name: "Everyday" }, { id: "savings", name: "Savings" }]));
const second = createVersionHistorySnapshot(storage, {
  description: "Before EOFY cleanup",
  now: new Date("2026-06-29T10:00:00.000Z"),
  snapshotId: "snapshot-2",
  retentionLimit: 3,
});
assertEqual(second.snapshot?.source, "manual", "described snapshots should be labelled manual");
assertEqual(second.snapshot?.description, "Before EOFY cleanup");

storage.setItem(payeesKey, JSON.stringify([{ id: "grocer", name: "Grocer" }, { id: "chemist", name: "Chemist" }]));
createVersionHistorySnapshot(storage, {
  now: new Date("2026-06-29T11:00:00.000Z"),
  snapshotId: "snapshot-3",
  retentionLimit: 3,
});
const fourth = createVersionHistorySnapshot(storage, {
  now: new Date("2026-06-29T12:00:00.000Z"),
  snapshotId: "snapshot-4",
  retentionLimit: 3,
});
assertEqual(fourth.retainedSnapshots, 3, "retention limit should cap the index");
assertDeepEqual(fourth.prunedSnapshots.map((snapshot) => snapshot.id), ["snapshot-1"], "oldest snapshot should be pruned first");

const snapshots = listVersionHistorySnapshots(storage);
assertDeepEqual(snapshots.map((snapshot) => snapshot.id), ["snapshot-4", "snapshot-3", "snapshot-2"], "snapshots should list newest first");
assertEqual(readVersionHistorySnapshotPackage(storage, "snapshot-1"), null, "pruned snapshot payload should be removed");
assertOk(readVersionHistorySnapshotPackage(storage, "snapshot-2"), "retained manual snapshot should still be readable");

storage.setItem(accountsKey, JSON.stringify([{ id: "changed", name: "Changed" }]));
const restore = restoreVersionHistorySnapshot(storage, "snapshot-2");
assertEqual(restore.restored, true, "snapshot restore should restore budget records");
assertEqual(restore.snapshotDescription, "Before EOFY cleanup");
assertEqual(storage.getItem(accountsKey), JSON.stringify([{ id: "everyday", name: "Everyday" }, { id: "savings", name: "Savings" }]));
assertEqual(storage.getItem(businessAccountsKey), JSON.stringify([{ id: "business", name: "Business" }]), "restoring household snapshot must not touch another budget");

assertEqual(deleteVersionHistorySnapshot(storage, "snapshot-3"), true, "snapshot delete should remove metadata and payload");
assertEqual(readVersionHistorySnapshotPackage(storage, "snapshot-3"), null);
assertDeepEqual(listVersionHistorySnapshots(storage).map((snapshot) => snapshot.id), ["snapshot-4", "snapshot-2"]);

const historyKeys = collectVersionHistoryStorageKeys(storage, household.id);
assertOk(historyKeys.some((key) => key.includes("budget-app.version-history-index.v1")), "history index should be stored with the budget");
assertOk(historyKeys.every((key) => key.startsWith(`budget-app.budgets.${household.id}.`)), "history keys should be budget scoped");

console.log("v2.33.0 data protection architecture checks passed");

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

