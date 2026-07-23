import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  readVersionHistorySnapshotPackage,
  listVersionHistorySnapshots,
} from "../apps/web/src/features/budget/versionHistory.js";
import {
  createDailyVersionHistorySnapshotOnAppOpen,
  createVersionHistorySnapshotBeforeBudgetDelete,
  createVersionHistorySnapshotBeforeBudgetImport,
  createVersionHistorySnapshotBeforeBudgetReset,
} from "../apps/web/src/features/budget/versionHistoryLifecycle.js";
import {
  createBudgetRegistryEntry,
  createInitialBudgetRegistry,
  readBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry.js";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope.js";
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

function seedBudgetData(storage: KeyValueStoragePort, budgetId: string, accountId: string): void {
  storage.setItem(
    getBudgetScopedStorageKey(budgetId, "budget-app.accounts.v1"),
    JSON.stringify([{ id: accountId }]),
  );
  storage.setItem(
    `budget-app.budget-view.v1.${budgetId}.2026-07`,
    JSON.stringify({ budgetId, readyToAssign: 0 }),
  );
}

function testLifecycleRestorePointTriggers(): void {
  const storage = new MemoryStorage();
  const household = createBudgetRegistryEntry(storage, {
    name: "Household Budget",
    currency: "AUD",
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  const travel = createBudgetRegistryEntry(storage, {
    name: "Travel Budget",
    currency: "AUD",
    now: new Date("2026-07-02T00:00:00.000Z"),
  });

  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);
  seedBudgetData(storage, household.id, "everyday");
  seedBudgetData(storage, travel.id, "travel-card");

  const daily = createDailyVersionHistorySnapshotOnAppOpen(storage, {
    now: new Date("2026-07-02T09:00:00.000Z"),
  });
  assert.equal(daily.created, true, "first app-open snapshot of the day should be created");
  assert.equal(daily.event, "daily-app-open");

  const secondDaily = createDailyVersionHistorySnapshotOnAppOpen(storage, {
    now: new Date("2026-07-02T12:00:00.000Z"),
  });
  assert.equal(secondDaily.created, false, "second app-open snapshot on same day should be skipped");
  assert.match(secondDaily.skippedReason ?? "", /already exists/);

  const beforeImport = createVersionHistorySnapshotBeforeBudgetImport(storage, {
    now: new Date("2026-07-02T13:00:00.000Z"),
  });
  assert.equal(beforeImport.created, true, "budget import should protect current budget first");
  assert.equal(beforeImport.snapshot?.description, "Automatic restore point before budget import.");

  const beforeReset = createVersionHistorySnapshotBeforeBudgetReset(storage, {
    now: new Date("2026-07-02T14:00:00.000Z"),
  });
  assert.equal(beforeReset.created, true, "budget reset should create a safety restore point");
  assert.equal(beforeReset.snapshot?.budgetId, household.id);

  const beforeDeleteInactive = createVersionHistorySnapshotBeforeBudgetDelete(storage, travel.id, {
    now: new Date("2026-07-02T15:00:00.000Z"),
  });
  assert.equal(beforeDeleteInactive.created, true, "budget delete should snapshot the budget being deleted");
  assert.equal(beforeDeleteInactive.snapshot?.budgetId, travel.id);

  const inactiveSnapshot = readVersionHistorySnapshotPackage(
    storage,
    beforeDeleteInactive.snapshot!.id,
    travel.id,
  );
  assert.equal(inactiveSnapshot?.budgetPackage.budget.id, travel.id, "inactive budget snapshot should export inactive budget data");

  assert.deepEqual(
    listVersionHistorySnapshots(storage, household.id).map((snapshot) => snapshot.description),
    [
      "Automatic restore point before resetting budget.",
      "Automatic restore point before budget import.",
      "Daily automatic restore point.",
    ],
    "household snapshots should list newest first with lifecycle descriptions",
  );
}

function testCodePathsAreWired(): void {
  const store = readFileSync(join(process.cwd(), "apps/web/src/stores/budgetRegistryStore.ts"), "utf8");
  const settings = readFileSync(join(process.cwd(), "apps/web/src/pages/SettingsPage.tsx"), "utf8");
  const exportService = readFileSync(join(process.cwd(), "apps/web/src/features/budget/budgetDataExport.ts"), "utf8");

  assert.match(store, /createDailyVersionHistorySnapshotOnAppOpen/);
  assert.match(store, /createVersionHistorySnapshotBeforeBudgetImport/);
  assert.match(store, /createVersionHistorySnapshotAfterActualImport/);
  assert.match(store, /createVersionHistorySnapshotBeforeBudgetDelete/);
  assert.match(settings, /createVersionHistorySnapshotBeforeBudgetReset/);
  assert.match(settings, /createVersionHistorySnapshotBeforeBudgetDelete/);
  assert.match(exportService, /createBudgetDataExportPackageForBudget/);
}

testLifecycleRestorePointTriggers();
testCodePathsAreWired();

console.log("v2.48.0 version history lifecycle expansion checks passed");
