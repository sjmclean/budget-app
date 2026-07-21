import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BUDGET_PREFERENCES } from "../../../apps/web/src/features/budget/budgetPreferences.js";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  type BudgetSummary,
} from "../../../apps/web/src/features/budget/budgetRegistry.js";
import { SELECTED_BUDGET_STORAGE_KEY } from "../../../apps/web/src/features/budget/budgetDataScope.js";
import {
  buildYnab4LauncherImportRecord,
  commitYnab4LauncherImport,
  getYnab4LauncherImportStorageKey,
} from "../../../apps/web/src/features/budget/ynab4/finaliseYnab4Import.js";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";
import type {
  Ynab4PackageDiscoveryResult,
  Ynab4PackageMigrationPreview,
} from "../../../packages/ynab4-importer/src/analyzeYnab4Package.js";
import type { Ynab4LauncherImportAccuracyAuditResult } from "../../../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.js";

const now = new Date("2026-07-20T10:00:00.000Z");

function createBudget(): BudgetSummary {
  return {
    id: "budget-finalise-test",
    name: "Imported Budget",
    currency: "AUD",
    preferences: DEFAULT_BUDGET_PREFERENCES,
    lastOpenedLabel: "Not opened yet",
    packagePath: "~/Budgets/Imported.budget",
    createdAt: "2026-07-20T09:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z",
  };
}

function createDiscovery(): Ynab4PackageDiscoveryResult {
  return {
    packageRoot: "~/YNAB/Budget",
    budgetDataPath: "~/YNAB/Budget/data1/Budget.yfull",
    counts: {
      accounts: 2,
      masterCategories: 3,
      categories: 4,
      payees: 5,
      monthlyBudgets: 6,
      transactions: 7,
      scheduledTransactions: 8,
      categoryNotes: 9,
      categoryGroupNotes: 10,
    },
  } as Ynab4PackageDiscoveryResult;
}

function createPreview(): Ynab4PackageMigrationPreview {
  return {
    budgetName: "Source Budget",
    warnings: ["preview warning"],
    progressSteps: [
      { phase: "mapping", label: "Map data", detail: "Mapped source entities" },
    ],
  } as unknown as Ynab4PackageMigrationPreview;
}

function createAudit(): Ynab4LauncherImportAccuracyAuditResult {
  return { status: "pass" } as Ynab4LauncherImportAccuracyAuditResult;
}

function createMemoryStorage(
  budget: BudgetSummary,
): KeyValueStoragePort & { values: Map<string, string> } {
  const values = new Map<string, string>([
    [BUDGET_REGISTRY_STORAGE_KEY, JSON.stringify([budget])],
  ]);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

function createRecordInput() {
  return {
    budget: createBudget(),
    discovery: createDiscovery(),
    preview: createPreview(),
    persistenceWarnings: ["persistence warning"],
    accuracyAudit: createAudit(),
    accuracyAuditReport: "YNAB4 audit passed",
    now,
  };
}

test("builds the completed YNAB4 import record without storage", () => {
  const record = buildYnab4LauncherImportRecord(createRecordInput());

  assert.equal(record.budgetId, "budget-finalise-test");
  assert.equal(record.sourceBudgetName, "Source Budget");
  assert.equal(record.importedAt, now.toISOString());
  assert.equal(record.counts.transactions, 7);
  assert.deepEqual(record.warnings, ["preview warning", "persistence warning"]);
  assert.deepEqual(record.progressSteps, [
    { phase: "mapping", label: "Map data", detail: "Mapped source entities" },
  ]);
  assert.equal(record.accuracyAuditReport, "YNAB4 audit passed");
});

test("commits the selected budget and completed import record", () => {
  const input = createRecordInput();
  const storage = createMemoryStorage(input.budget);

  const result = commitYnab4LauncherImport(storage, input);

  assert.equal(storage.values.get(SELECTED_BUDGET_STORAGE_KEY), input.budget.id);
  assert.deepEqual(
    JSON.parse(
      storage.values.get(getYnab4LauncherImportStorageKey(input.budget.id)) ?? "null",
    ),
    result.record,
  );
  assert.equal(result.budget.id, input.budget.id);
  assert.equal(result.budgets.length, 1);
});
