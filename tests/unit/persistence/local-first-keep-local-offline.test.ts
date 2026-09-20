import assert from "node:assert/strict";
import test from "node:test";

import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation, LocalFirstStoredConflict } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createLocalBudgetRuntime } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

const budgetId = "keep-local-budget";
const syncEpoch = "keep-local-epoch";
const deviceId = "keep-local-device";

function mutation(overrides: Partial<LocalBudgetMutation> = {}): LocalBudgetMutation {
  return {
    mutationId: "losing-mutation",
    budgetId,
    syncEpoch,
    deviceId: "losing-device",
    deviceSequence: 4,
    baseCursor: 8,
    domain: "transactionTags",
    entityId: "tag-a",
    operation: "upsert",
    payload: { id: "tag-a", name: "Local tag" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function conflict(conflictId: string, losingMutation = mutation()): LocalFirstStoredConflict {
  return {
    conflictId,
    budgetId,
    syncEpoch,
    entityKey: `${losingMutation.domain}:${losingMutation.entityId}`,
    detectedAt: "2026-01-02T00:00:00.000Z",
    losingMutation,
    winningMutation: mutation({ mutationId: `winner-${conflictId}`, deviceId: "remote-device" }),
    winningCursor: 42,
    status: "unresolved",
    resolvedAt: null,
  };
}

function storage() {
  const values = new Map<string, string>([
    ["budget-app.local-first.device-id", deviceId],
    [`budget-app.local-first.sync-epoch.${budgetId}`, syncEpoch],
    [`budget-app.local-first.database-file.${budgetId}`, `/budget-physical-${budgetId}-fixture.sqlite3`],
    [`budget-app.local-first.device-sequence.${deviceId}`, "12"],
  ]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function runtime(database: LocalBudgetDatabaseClient) {
  return createLocalBudgetRuntime({} as Parameters<typeof createLocalBudgetRuntime>[0], {
    databaseFactory: () => database,
    storage: storage(),
    tabSyncCoordinator: {
      async run<T>(_id: string, operation: () => Promise<T>) { return operation(); },
      close() {},
    },
  });
}

test("keep-local replays the stored mutation locally with fresh replication identity", async () => {
  const addressed = conflict("conflict-a");
  const untouched = conflict("conflict-b", mutation({ entityId: "tag-b" }));
  const writes: { mutation: LocalBudgetMutation; conflictId?: string }[] = [];
  const database = {
    async open() { return {}; },
    async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 42 }; },
    async readOutbox() { return []; },
    async listSyncConflicts() { return [addressed, untouched]; },
    async mutate(replay: LocalBudgetMutation, resolveConflictId?: string) {
      writes.push({ mutation: replay, conflictId: resolveConflictId });
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  try {
    await runtime(database).resolveSyncConflict(budgetId, addressed.conflictId, "keep-local");
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(writes.length, 1);
  const write = writes[0]!;
  assert.equal(write.conflictId, addressed.conflictId, "only the addressed conflict is resolved");
  assert.equal(write.mutation.domain, addressed.losingMutation.domain);
  assert.equal(write.mutation.entityId, addressed.losingMutation.entityId);
  assert.equal(write.mutation.operation, addressed.losingMutation.operation);
  assert.deepEqual(write.mutation.payload, addressed.losingMutation.payload);
  assert.notEqual(write.mutation.mutationId, addressed.losingMutation.mutationId);
  assert.equal(write.mutation.deviceId, deviceId);
  assert.equal(write.mutation.deviceSequence, 13);
  assert.equal(write.mutation.baseCursor, 42);
});

test("failed keep-local replay publishes nothing and leaves resolution to the atomic worker call", async () => {
  const addressed = conflict("conflict-failure");
  const database = {
    async open() { return {}; },
    async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 42 }; },
    async readOutbox() { return []; },
    async listSyncConflicts() { return [addressed]; },
    async mutate() { throw new Error("worker replay failed"); },
  } as unknown as LocalBudgetDatabaseClient;
  const changes: unknown[] = [];
  const unsubscribe = subscribePersistenceChanges((change) => changes.push(change));
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  try {
    await assert.rejects(
      runtime(database).resolveSyncConflict(budgetId, addressed.conflictId, "keep-local"),
      /worker replay failed/,
    );
    flushPersistenceChanges();
    assert.deepEqual(changes, []);
  } finally {
    unsubscribe();
    globalThis.fetch = previousFetch;
  }
});

test("keep-local rejects a missing or mismatched stored conflict before replay", async () => {
  let writes = 0;
  const database = {
    async open() { return {}; },
    async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 42 }; },
    async readOutbox() { return []; },
    async listSyncConflicts() { return [conflict("other-conflict")]; },
    async mutate() { writes += 1; return {}; },
  } as unknown as LocalBudgetDatabaseClient;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  try {
    await assert.rejects(
      runtime(database).resolveSyncConflict(budgetId, "missing-conflict", "keep-local"),
      /not found/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(writes, 0);
});
