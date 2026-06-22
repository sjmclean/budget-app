import assert from "node:assert/strict";

import {
  BUDGET_DATA_EXPORT_SCHEMA,
  createBudgetDataExportPackage,
  previewBudgetDataRestore,
  serialiseBudgetDataPackage,
} from "../apps/web/src/features/budget/budgetDataExport";
import {
  createInitialBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import { SETTINGS_STORAGE_KEY } from "../apps/web/src/features/settings/settingsPreferences";

class MemoryStorage implements KeyValueStoragePort {
  private values = new Map<string, string>();

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
    return Array.from(this.values.keys()).sort();
  }
}

const storage = new MemoryStorage();
writeBudgetRegistry(storage, createInitialBudgetRegistry(new Date("2026-06-22T00:00:00.000Z")));
storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
storage.setItem(
  getBudgetScopedStorageKey("household", "budget-app.accounts.v1"),
  JSON.stringify([{ id: "everyday", name: "Everyday", type: "on-budget", startingBalance: 10 }]),
);
storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: "dark" }));
storage.setItem("budget-app.budget-view.v1.household.2026-06", JSON.stringify({ marker: "month" }));

const budgetPackage = createBudgetDataExportPackage(
  storage,
  "backup",
  new Date("2026-06-22T03:00:00.000Z"),
);

assert.equal(budgetPackage.schema, "budget-app.budget-backup.v1");
assert.equal(budgetPackage.schema, BUDGET_DATA_EXPORT_SCHEMA);
assert.equal(budgetPackage.release, "v1.50.1");
assert.ok(budgetPackage.records.length > 0);
assert.ok(
  budgetPackage.records.every((record) => record.scope === "budget"),
  "records should contain restorable budget-scoped data only",
);
assert.ok(
  budgetPackage.diagnosticSnapshots.some((record) => record.key === SETTINGS_STORAGE_KEY),
  "global settings should be present only as diagnostic snapshots",
);
assert.ok(
  budgetPackage.diagnosticSnapshots.every((record) => record.scope === "global"),
  "diagnostic snapshots should be global context only",
);
assert.equal(
  budgetPackage.counts.storageRecords,
  budgetPackage.records.length,
  "storage record count should count restorable records, not diagnostic snapshots",
);
assert.ok(
  budgetPackage.notes.some((note) => note.includes("CSV remains a separate future transaction/report export format")),
  "package notes should clarify JSON backup versus future CSV exports",
);

const preview = previewBudgetDataRestore(serialiseBudgetDataPackage(budgetPackage));
assert.equal(preview.valid, true);
assert.deepEqual(preview.errors, []);
assert.equal(preview.warnings.length, 0);

const legacyPackage = JSON.parse(serialiseBudgetDataPackage(budgetPackage));
legacyPackage.schema = "budget-app.data-export.v1";
const legacyPreview = previewBudgetDataRestore(JSON.stringify(legacyPackage));
assert.equal(legacyPreview.valid, true);
assert.ok(
  legacyPreview.warnings.some((warning) => warning.includes("legacy v1.49/v1.50")),
  "legacy schema should be accepted with a compatibility warning",
);

console.log("v1.50.1 budget backup schema cleanup checks passed");
