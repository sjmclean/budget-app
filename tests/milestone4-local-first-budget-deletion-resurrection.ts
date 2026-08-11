import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createAuthStore } from "../apps/server/src/authStore.mjs";
import { createBudgetDeletionLifecycle } from "../apps/server/src/budgetDeletionLifecycle.mjs";
import { performAuthorizedBudgetMutation } from "../apps/server/src/budgetMutationAuthorization.mjs";
import {
  createLocalFirstRelayStore,
  LOCAL_FIRST_REQUIRED_DOMAINS,
} from "../apps/server/src/localFirstRelayStore.mjs";
import { createReplicationStore } from "../apps/server/src/replicationStore.mjs";
import {
  mergeHostedBudgetCatalogue,
  readBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";

const directory = mkdtempSync(join(tmpdir(), "budget-delete-resurrection-"));
const database = new Database(":memory:");
database.exec(`
  CREATE TABLE hosted_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, email_normalized TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, disabled_at TEXT
  );
  CREATE TABLE hosted_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE TABLE hosted_budget_memberships (
    budget_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (budget_id, user_id)
  );
  CREATE TABLE budget_engine_generations (
    budget_id TEXT NOT NULL, generation_id TEXT NOT NULL, state TEXT NOT NULL
  );
  CREATE TABLE budget_import_sessions (
    generation_id TEXT PRIMARY KEY, budget_id TEXT NOT NULL,
    budget_name TEXT NOT NULL, currency TEXT NOT NULL, state TEXT NOT NULL
  );
`);

try {
  const replicationStore = createReplicationStore(database, {
    blobDirectory: join(directory, "replication"),
  });
  const localFirstRelayStore = createLocalFirstRelayStore(database, {
    blobDirectory: join(directory, "local-first"),
  });
  const authStore = createAuthStore(database);
  const deletion = createBudgetDeletionLifecycle({
    authStore,
    replicationStore,
    localFirstRelayStore,
  });
  const admin = authStore.setup({
    email: "admin@example.test",
    password: "correct horse battery staple",
  });
  const budgetId = "local-first-delete-budget";
  const survivingBudgetId = "shared-blob-budget";
  authStore.claimBudget(admin, budgetId);
  authStore.claimBudget(admin, survivingBudgetId);
  const generation = replicationStore.getGeneration(budgetId);
  const survivingGeneration = replicationStore.getGeneration(survivingBudgetId);
  const operation = {
    formatVersion: 1,
    operationId: "delete-operation",
    deviceId: "delete-device",
    sequence: 1,
    createdAt: "2026-08-11T00:00:00.000Z",
    mutation: {
      type: "key-value.set",
      key: `budget-app.budgets.${budgetId}.budget-app.accounts.v1`,
      value: "[]",
    },
  };
  replicationStore.pushOperations(budgetId, generation.generationId, [operation]);
  replicationStore.saveCheckpoint(budgetId, generation.generationId, {
    checkpointId: "delete-checkpoint",
    createdAt: "2026-08-11T00:00:00.000Z",
    throughSequence: 1,
    integrityHash: "checkpoint-integrity",
    replicatedThroughCursor: 1,
    entries: {},
  });
  const sharedContent = Buffer.from("shared attachment content");
  const sharedHash = `sha256:${createHash("sha256").update(sharedContent).digest("hex")}`;
  replicationStore.saveBlob(
    budgetId, generation.generationId, sharedHash, "text/plain", sharedContent,
  );
  replicationStore.saveBlob(
    survivingBudgetId,
    survivingGeneration.generationId,
    sharedHash,
    "text/plain",
    sharedContent,
  );

  const epoch = localFirstRelayStore.resetEpoch(budgetId, 1);
  localFirstRelayStore.updateBudgetMetadata(budgetId, {
    budgetName: "Delete me",
    currency: "AUD",
  });
  const baselineContent = Buffer.from("x");
  const baselineHash = `sha256:${createHash("sha256").update(baselineContent).digest("hex")}`;
  const counts = Object.fromEntries(
    LOCAL_FIRST_REQUIRED_DOMAINS.map((domain) => [domain, 0]),
  );
  const baseline = localFirstRelayStore.beginBaseline(budgetId, epoch.syncEpoch, {
    budgetId,
    budgetName: "Delete me",
    currency: "AUD",
    syncEpoch: epoch.syncEpoch,
    schemaVersion: 1,
    counts,
    chunkCount: 1,
    totalBytes: baselineContent.length,
    contentHash: baselineHash,
    baseCursor: 0,
    previousBaselineId: null,
  });
  localFirstRelayStore.saveBaselineChunk(
    budgetId,
    epoch.syncEpoch,
    baseline.baselineId,
    0,
    baselineHash,
    baselineContent,
  );
  localFirstRelayStore.commitBaseline(budgetId, epoch.syncEpoch, baseline.baselineId);
  localFirstRelayStore.pushMutations(budgetId, epoch.syncEpoch, [{
    mutationId: "local-delete-mutation",
    deviceId: "delete-device",
    deviceSequence: 1,
    baseCursor: 0,
    domain: "accounts",
    entityId: "account-1",
    operation: "upsert",
    payload: { id: "account-1" },
  }]);

  assert.ok(generation.generationId);
  assert.equal(authStore.listBudgets(admin).some((budget) => budget.budgetId === budgetId), true);

  const result = deletion.deleteBudget(budgetId);
  assert.equal(result.deleted, true);
  for (const table of [
    "hosted_budget_memberships",
    "local_first_sync_epochs",
    "local_first_budget_metadata",
    "replication_generations",
    "replication_operations",
    "replication_checkpoints",
    "replication_blobs",
    "local_first_baselines",
    "local_first_mutations",
  ]) {
    assert.equal(
      database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE budget_id = ?`)
        .get(budgetId).count,
      0,
      `${table} retained deleted budget state.`,
    );
  }
  assert.equal(
    database.prepare(
      "SELECT COUNT(*) AS count FROM local_first_baseline_chunks WHERE baseline_id = ?",
    ).get(baseline.baselineId).count,
    0,
    "local_first_baseline_chunks retained deleted budget state.",
  );
  assert.equal(
    replicationStore.hasBlob(
      survivingBudgetId,
      survivingGeneration.generationId,
      sharedHash,
    ),
    true,
    "A blob still referenced by another budget was physically deleted.",
  );
  assert.equal(
    existsSync(join(directory, "replication", sharedHash.slice("sha256:".length))),
    true,
  );
  assert.equal(authStore.listBudgets(admin).some((budget) => budget.budgetId === budgetId), false);

  assert.throws(
    () => authStore.requireBudgetRole(admin, budgetId, "viewer"),
    (error: { code?: string }) => error.code === "BUDGET_ACCESS_DENIED",
  );
  assert.equal(
    database.prepare(
      "SELECT COUNT(*) AS count FROM hosted_budget_memberships WHERE budget_id = ?",
    ).get(budgetId).count,
    0,
    "Authorization recreated a deleted membership.",
  );

  assert.throws(
    () => performAuthorizedBudgetMutation(
      authStore,
      admin,
      budgetId,
      "owner",
      () => localFirstRelayStore.resetEpoch(budgetId, 1),
    ),
    (error: { code?: string }) => error.code === "BUDGET_ACCESS_DENIED",
  );
  for (const table of [
    "hosted_budget_memberships",
    "local_first_sync_epochs",
    "local_first_budget_metadata",
    "replication_generations",
  ]) {
    assert.equal(
      database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE budget_id = ?`)
        .get(budgetId).count,
      0,
      `A stale epoch reset recreated ${table}.`,
    );
  }
  assert.equal(authStore.listBudgets(admin).some((budget) => budget.budgetId === budgetId), false);

  let staleMutationRan = false;
  assert.throws(
    () => performAuthorizedBudgetMutation(
      authStore,
      admin,
      budgetId,
      "editor",
      () => { staleMutationRan = true; },
    ),
    (error: { code?: string }) => error.code === "BUDGET_ACCESS_DENIED",
  );
  assert.equal(staleMutationRan, false, "A stale post-body mutation crossed deletion.");
  assert.equal(authStore.listBudgets(admin).some((budget) => budget.budgetId === budgetId), false);

  const newBudgetId = "explicitly-provisioned-budget";
  assert.equal(authStore.claimBudget(admin, newBudgetId), "owner");
  const newEpoch = performAuthorizedBudgetMutation(
    authStore,
    admin,
    newBudgetId,
    "owner",
    () => localFirstRelayStore.resetEpoch(newBudgetId, 1),
  );
  assert.ok(newEpoch.syncEpoch, "Explicit provisioning did not permit initial epoch creation.");

  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  writeBudgetRegistry(storage, [{
    id: budgetId,
    name: "Delete me",
    currency: "AUD",
    dateFormat: "DD/MM/YYYY",
    numberFormat: "1,234.56",
    firstDayOfWeek: "monday",
    preferences: {},
    lastOpenedLabel: "Recently",
    packagePath: "~/Budgets/DeleteMe.yfull",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }]);
  writeBudgetRegistry(storage, []);
  mergeHostedBudgetCatalogue(storage, authStore.listBudgets(admin));
  assert.equal(
    readBudgetRegistry(storage).some((budget) => budget.id === budgetId),
    false,
    "Server rehydration resurrected the deleted budget.",
  );
} finally {
  database.close();
  rmSync(directory, { recursive: true, force: true });
}

console.log("Milestone 4 local-first deletion resurrection regression passed.");
