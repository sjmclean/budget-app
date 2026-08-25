import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  createLocalFirstRelayStore,
  LOCAL_FIRST_REQUIRED_DOMAINS,
} from "../../../apps/server/src/localFirstRelayStore.mjs";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";

function relayHarness() {
  const directory = mkdtempSync(join(tmpdir(), "category-goal-relay-"));
  const database = new Database(":memory:");
  const store = createLocalFirstRelayStore(database, { blobDirectory: directory });
  const budgetId = "goal-relay-budget";
  const epoch = store.resetEpoch(budgetId, 1);
  const content = Buffer.from("complete local SQLite baseline");
  const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const counts = Object.fromEntries(LOCAL_FIRST_REQUIRED_DOMAINS.map((domain) => [domain, 0]));
  const baseline = store.beginBaseline(budgetId, epoch.syncEpoch, {
    budgetId,
    budgetName: "Goal relay",
    currency: "AUD",
    syncEpoch: epoch.syncEpoch,
    schemaVersion: 1,
    counts,
    chunkCount: 1,
    totalBytes: content.length,
    contentHash,
    baseCursor: 0,
    previousBaselineId: null,
  });
  store.saveBaselineChunk(
    budgetId, epoch.syncEpoch, baseline.baselineId, 0, contentHash, content,
  );
  store.commitBaseline(budgetId, epoch.syncEpoch, baseline.baselineId);
  return {
    store,
    budgetId,
    syncEpoch: epoch.syncEpoch,
    close() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function goalMutation(overrides: Partial<LocalBudgetMutation> = {}): LocalBudgetMutation {
  return {
    mutationId: "goal-mutation-1",
    budgetId: "goal-relay-budget",
    syncEpoch: "supplied-by-harness",
    deviceId: "goal-device",
    deviceSequence: 1,
    baseCursor: 0,
    domain: "categoryGoals",
    entityId: "category-1",
    operation: "upsert",
    payload: {
      id: "goal-1",
      budgetId: "goal-relay-budget",
      categoryId: "category-1",
      type: "monthly-funding",
      targetAmount: 500,
      targetMonth: null,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    createdAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

test("server relay accepts and pulls the production categoryGoals mutation contract", () => {
  const harness = relayHarness();
  try {
    assert.equal(LOCAL_FIRST_REQUIRED_DOMAINS.includes("categoryGoals"), true);
    const mutation = goalMutation({ budgetId: harness.budgetId, syncEpoch: harness.syncEpoch });
    const pushed = harness.store.pushMutations(harness.budgetId, harness.syncEpoch, [mutation]);
    assert.deepEqual(pushed, {
      acceptedCount: 1,
      acknowledgedCount: 1,
      latestCursor: 1,
      detectedConflictCount: 0,
    });
    const pulled = harness.store.pullMutations(harness.budgetId, harness.syncEpoch, 0);
    assert.equal(pulled.mutations.length, 1);
    assert.equal(pulled.mutations[0]?.cursor, 1);
    assert.deepEqual(pulled.mutations[0]?.mutation, mutation);
  } finally {
    harness.close();
  }
});

test("server baseline manifests require a categoryGoals domain count", () => {
  const directory = mkdtempSync(join(tmpdir(), "category-goal-relay-manifest-"));
  const database = new Database(":memory:");
  try {
    const store = createLocalFirstRelayStore(database, { blobDirectory: directory });
    const budgetId = "goal-manifest-budget";
    const epoch = store.resetEpoch(budgetId, 1);
    const counts = Object.fromEntries(LOCAL_FIRST_REQUIRED_DOMAINS.map((domain) => [domain, 0]));
    delete counts.categoryGoals;
    assert.throws(
      () => store.beginBaseline(budgetId, epoch.syncEpoch, {
        budgetId,
        budgetName: "Incomplete Goal baseline",
        currency: "AUD",
        syncEpoch: epoch.syncEpoch,
        schemaVersion: 1,
        counts,
        chunkCount: 1,
        totalBytes: 1,
        contentHash: `sha256:${"0".repeat(64)}`,
        baseCursor: 0,
        previousBaselineId: null,
      }),
      (error: { code?: string }) => error.code === "INCOMPLETE_BASELINE_MANIFEST",
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("server relay orders mixed existing-domain and categoryGoals batches", () => {
  const harness = relayHarness();
  try {
    const account: LocalBudgetMutation = {
      ...goalMutation(), mutationId: "account-mutation-1", syncEpoch: harness.syncEpoch,
      domain: "accounts", entityId: "account-1", payload: { id: "account-1" },
    };
    const goal = goalMutation({ syncEpoch: harness.syncEpoch, deviceSequence: 2 });
    const pushed = harness.store.pushMutations(harness.budgetId, harness.syncEpoch, [account, goal]);
    assert.equal(pushed.acceptedCount, 2);
    assert.equal(pushed.latestCursor, 2);
    const pulled = harness.store.pullMutations(harness.budgetId, harness.syncEpoch, 0);
    assert.deepEqual(
      pulled.mutations.map(({ cursor, mutation }) => [cursor, mutation.domain]),
      [[1, "accounts"], [2, "categoryGoals"]],
    );
  } finally {
    harness.close();
  }
});

test("categoryGoals retains generic idempotency and unknown domains remain invalid", () => {
  const harness = relayHarness();
  try {
    const mutation = goalMutation({ syncEpoch: harness.syncEpoch });
    assert.equal(
      harness.store.pushMutations(harness.budgetId, harness.syncEpoch, [mutation]).acceptedCount,
      1,
    );
    const duplicate = harness.store.pushMutations(harness.budgetId, harness.syncEpoch, [mutation]);
    assert.equal(duplicate.acceptedCount, 0);
    assert.equal(duplicate.acknowledgedCount, 1);
    assert.equal(harness.store.pullMutations(harness.budgetId, harness.syncEpoch, 0).mutations.length, 1);
    assert.throws(
      () => harness.store.pushMutations(harness.budgetId, harness.syncEpoch, [{
        ...mutation,
        mutationId: "unknown-domain",
        deviceSequence: 2,
        domain: "goals",
      }]),
      (error: { code?: string }) => error.code === "INVALID_MUTATION",
    );
  } finally {
    harness.close();
  }
});
