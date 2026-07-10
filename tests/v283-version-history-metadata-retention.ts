import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createVersionHistorySnapshot,
  listVersionHistorySnapshots,
  readVersionHistorySnapshotPackage,
} from "../apps/web/src/features/budget/versionHistory.js";
import {
  createTimedDirtyBudgetVersionHistoryCheckpoint,
  createVersionHistorySnapshotBeforeBudgetImport,
} from "../apps/web/src/features/budget/versionHistoryLifecycle.js";
import {
  createBudgetRegistryEntry,
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

function seedBudget(storage: KeyValueStoragePort, budgetId: string): void {
  storage.setItem(
    getBudgetScopedStorageKey(budgetId, "budget-app.accounts.v1"),
    JSON.stringify([{ id: "checking", name: "Checking" }]),
  );
}

function createStorageWithActiveBudget(): { storage: MemoryStorage; budgetId: string } {
  const storage = new MemoryStorage();
  const budget = createBudgetRegistryEntry(storage, {
    name: "Household",
    currency: "AUD",
    now: new Date("2026-07-10T00:00:00.000Z"),
  });

  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, budget.id);
  seedBudget(storage, budget.id);
  return { storage, budgetId: budget.id };
}

function testVersionMetadata(): void {
  const { storage, budgetId } = createStorageWithActiveBudget();

  const manual = createVersionHistorySnapshot(storage, {
    snapshotId: "manual-1",
    now: new Date("2026-07-10T08:00:00.000Z"),
    origin: "manual",
    reason: "manual-version",
    description: "Before reconciling",
    changedAreas: ["accounts", "accounts", "budget"],
    approximateChanges: "small",
  });

  assert.equal(manual.created, true);
  assert.equal(manual.snapshot?.timestamp, "2026-07-10T08:00:00.000Z");
  assert.equal(manual.snapshot?.origin, "manual");
  assert.equal(manual.snapshot?.source, "manual");
  assert.equal(manual.snapshot?.reason, "manual-version");
  assert.deepEqual(manual.snapshot?.changedAreas, ["accounts", "budget"]);
  assert.equal(manual.snapshot?.approximateChanges, "small");

  const automatic = createVersionHistorySnapshotBeforeBudgetImport(storage, {
    now: new Date("2026-07-10T09:00:00.000Z"),
  });

  assert.equal(automatic.created, true);
  assert.equal(automatic.snapshot?.origin, "automatic");
  assert.equal(automatic.snapshot?.reason, "before-import");
  assert.deepEqual(automatic.snapshot?.changedAreas, ["budget data", "import"]);
  assert.equal(automatic.snapshot?.approximateChanges, "potentially high");

  const packageMetadata = readVersionHistorySnapshotPackage(storage, automatic.snapshot!.id, budgetId)?.metadata;
  assert.equal(packageMetadata?.timestamp, automatic.snapshot?.createdAt);
  assert.equal(packageMetadata?.reason, "before-import");
  assert.equal(
    readVersionHistorySnapshotPackage(storage, automatic.snapshot!.id, budgetId)?.budgetPackage.kind,
    "export",
    "Version History restore payloads should not be labelled as backup packages",
  );
}

function testTimedDirtyCheckpointReason(): void {
  const { storage } = createStorageWithActiveBudget();

  const result = createTimedDirtyBudgetVersionHistoryCheckpoint(storage, {
    now: new Date("2026-07-10T10:00:00.000Z"),
  });

  assert.equal(result.created, true);
  assert.equal(result.event, "timed-dirty-budget-checkpoint");
  assert.equal(result.snapshot?.reason, "timed-dirty-budget-checkpoint");
  assert.equal(result.snapshot?.origin, "automatic");
}

function testTimeBucketRetentionTreatsManualAndAutomaticEqually(): void {
  const { storage } = createStorageWithActiveBudget();

  createVersionHistorySnapshot(storage, {
    snapshotId: "manual-older-same-hour",
    now: new Date("2026-07-10T11:05:00.000Z"),
    origin: "manual",
    reason: "manual-version",
    description: "Manual entry in same hour",
    retentionLimit: 30,
  });
  createVersionHistorySnapshot(storage, {
    snapshotId: "automatic-newer-same-hour",
    now: new Date("2026-07-10T11:45:00.000Z"),
    origin: "automatic",
    reason: "timed-dirty-budget-checkpoint",
    description: "Automatic entry in same hour",
    retentionLimit: 30,
  });

  const snapshots = listVersionHistorySnapshots(storage);
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.id),
    ["automatic-newer-same-hour"],
    "time-bucket retention should keep the newest snapshot in the hour without protecting manual entries",
  );
}

function testCodePathsStaySeparated(): void {
  const versionHistory = readFileSync("apps/web/src/features/budget/versionHistory.ts", "utf8");
  const lifecycle = readFileSync("apps/web/src/features/budget/versionHistoryLifecycle.ts", "utf8");
  const settingsPage = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(versionHistory, /timestamp: string/);
  assert.match(versionHistory, /reason: VersionHistoryCheckpointReason/);
  assert.match(versionHistory, /changedAreas: string\[\]/);
  assert.match(versionHistory, /approximateChanges: string/);
  assert.match(versionHistory, /origin: VersionHistorySnapshotOrigin/);
  assert.match(versionHistory, /applyVersionHistoryTimeBucketRetention/);
  assert.doesNotMatch(versionHistory, /pruneAutomaticBackupVersions/);

  assert.match(lifecycle, /timed-dirty-budget-checkpoint/);
  assert.match(lifecycle, /daily-checkpoint/);
  assert.match(lifecycle, /before-delete/);
  assert.match(lifecycle, /before-reset/);
  assert.match(lifecycle, /before-import/);
  assert.match(lifecycle, /after-import/);
  assert.match(lifecycle, /before-budget-switch/);

  assert.match(settingsPage, /Version History is separate from/);
  assert.match(settingsPage, /Undo\/Redo/);
  assert.match(settingsPage, /exported backup packages/);
  assert.match(settingsPage, /<dt>Origin<\/dt>/);
  assert.match(settingsPage, /<dt>Reason<\/dt>/);
  assert.match(settingsPage, /<dt>Changed areas<\/dt>/);
  assert.match(settingsPage, /<dt>Approximate changes<\/dt>/);

  assert.equal(
    packageJson.scripts["test:v283:version-history-metadata-retention"],
    "tsx tests/v283-version-history-metadata-retention.ts",
  );
}

testVersionMetadata();
testTimedDirtyCheckpointReason();
testTimeBucketRetentionTreatsManualAndAutomaticEqually();
testCodePathsStaySeparated();

console.log("v2.83 version history metadata and retention checks passed");
