import Database from "better-sqlite3";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import {
  convergeLocalFirstMutations,
  type LocalFirstConvergenceDatabase,
  type LocalFirstConvergenceRelay,
} from "../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetMutation } from "../../apps/web/src/features/persistence/localFirst/contracts.js";

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw === undefined ? fallback : Number(raw);
}

const operationCount = readNumber("LOCAL_FIRST_SYNC_OPERATIONS", 20_000);
const remoteOperationCount = readNumber(
  "LOCAL_FIRST_SYNC_REMOTE_OPERATIONS",
  Math.max(1_000, Math.floor(operationCount / 2)),
);
const payloadBytes = readNumber("LOCAL_FIRST_SYNC_PAYLOAD_BYTES", 256);
const budgetId = "benchmark-budget";
const syncEpoch = "benchmark-epoch";
const payload = "x".repeat(Math.max(1, payloadBytes - 64));
const database = new Database(":memory:");

database.exec(`
  CREATE TABLE local_budget_outbox (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id TEXT NOT NULL UNIQUE,
    operation_group_id TEXT,
    operation_group_json TEXT,
    device_id TEXT NOT NULL,
    device_sequence INTEGER NOT NULL,
    base_cursor INTEGER NOT NULL DEFAULT 0,
    domain TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX local_budget_outbox_pending
    ON local_budget_outbox(acknowledged, sequence);
  CREATE TABLE remote_applied (
    cursor INTEGER PRIMARY KEY,
    mutation_id TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    pulled_cursor INTEGER NOT NULL
  );
  INSERT INTO sync_state(id, pulled_cursor) VALUES (1, 0);
`);

const insertOutbox = database.prepare(`
  INSERT INTO local_budget_outbox(
    mutation_id, operation_group_id, operation_group_json,
    device_id, device_sequence, base_cursor, domain, entity_id,
    operation, payload_json, created_at, acknowledged
  ) VALUES (?, NULL, NULL, ?, ?, 0, 'transactions', ?, 'upsert', ?, ?, 0)
`);
const seedOutbox = database.transaction(() => {
  for (let index = 0; index < operationCount; index += 1) {
    insertOutbox.run(
      `local-${index + 1}`,
      "benchmark-device",
      index + 1,
      `transaction-${index + 1}`,
      JSON.stringify({ amount: index, memo: payload }),
      "2026-09-20T00:00:00.000Z",
    );
  }
});
seedOutbox();

const remoteMutations = Array.from(
  { length: remoteOperationCount },
  (_, index): LocalBudgetMutation => ({
    mutationId: `remote-${index + 1}`,
    budgetId,
    syncEpoch,
    deviceId: "remote-device",
    deviceSequence: index + 1,
    baseCursor: 0,
    domain: "transactions",
    entityId: `remote-transaction-${index + 1}`,
    operation: "upsert",
    payload: { amount: index, memo: payload },
    createdAt: "2026-09-20T00:00:00.000Z",
  }),
);

const readOutbox = database.prepare(`
  SELECT sequence, mutation_id AS mutationId,
    operation_group_id AS operationGroupId,
    operation_group_json AS operationGroupJson,
    device_id AS deviceId, device_sequence AS deviceSequence,
    base_cursor AS baseCursor, domain, entity_id AS entityId,
    operation, payload_json AS payloadJson, created_at AS createdAt
  FROM local_budget_outbox
  WHERE acknowledged = 0 AND sequence > ?
  ORDER BY sequence LIMIT ?
`);
const acknowledgeOutbox = database.prepare(
  "DELETE FROM local_budget_outbox WHERE sequence <= ?",
);
const insertRemote = database.prepare(
  "INSERT INTO remote_applied(cursor, mutation_id, payload_json) VALUES (?, ?, ?)",
);
const updateCursor = database.prepare(
  "UPDATE sync_state SET pulled_cursor = ? WHERE id = 1",
);
const applyRemote = database.transaction((
  mutations: Parameters<LocalFirstConvergenceDatabase["applyRemoteMutations"]>[0],
  throughCursor: number,
) => {
  for (const envelope of mutations) {
    insertRemote.run(
      envelope.cursor,
      envelope.mutation.mutationId,
      JSON.stringify(envelope.mutation.payload),
    );
  }
  updateCursor.run(throughCursor);
});

const local: LocalFirstConvergenceDatabase = {
  readOutbox: async (afterSequence, limit) =>
    readOutbox.all(afterSequence, limit) as Awaited<
      ReturnType<LocalFirstConvergenceDatabase["readOutbox"]>
    >,
  acknowledgeOutbox: async (throughSequence) => {
    acknowledgeOutbox.run(throughSequence);
  },
  applyRemoteMutations: async (mutations, throughCursor) => {
    applyRemote(mutations, throughCursor);
  },
};

let relayAccepted = 0;
let pushedWireBytes = 0;
const relay: LocalFirstConvergenceRelay = {
  pushMutations: async (input) => {
    const wire = JSON.stringify(input);
    pushedWireBytes += Buffer.byteLength(wire);
    const decoded = JSON.parse(wire) as { mutations: unknown[] };
    relayAccepted += decoded.mutations.length;
    return {
      acceptedCount: decoded.mutations.length,
      acknowledgedCount: decoded.mutations.length,
      latestCursor: relayAccepted,
      detectedConflictCount: 0,
    };
  },
  pullMutations: async (input) => {
    const start = input.afterCursor;
    const end = Math.min(remoteMutations.length, start + (input.limit ?? 500));
    return {
      mutations: remoteMutations.slice(start, end).map((mutation, index) => ({
        cursor: start + index + 1,
        receivedAt: "2026-09-20T00:00:00.000Z",
        mutation,
      })),
      latestCursor: remoteMutations.length,
      hasMore: end < remoteMutations.length,
      baseCursor: 0,
    };
  },
};

const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
const convergence = await convergeLocalFirstMutations({
  local,
  relay,
  budgetId,
  syncEpoch,
  pulledCursor: 0,
});
const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
const memory = process.memoryUsage();

const remainingOutbox = (
  database.prepare("SELECT COUNT(*) AS count FROM local_budget_outbox").get() as {
    count: number;
  }
).count;
const appliedRemote = (
  database.prepare("SELECT COUNT(*) AS count FROM remote_applied").get() as {
    count: number;
  }
).count;
const pulledCursor = (
  database.prepare("SELECT pulled_cursor AS pulledCursor FROM sync_state WHERE id = 1").get() as {
    pulledCursor: number;
  }
).pulledCursor;

if (
  convergence.pushedMutationCount !== operationCount ||
  relayAccepted !== operationCount ||
  remainingOutbox !== 0
) {
  throw new Error("The persisted local outbox did not converge completely.");
}
if (
  convergence.pulledMutationCount !== remoteOperationCount ||
  appliedRemote !== remoteOperationCount ||
  pulledCursor !== remoteOperationCount ||
  convergence.pulledCursor !== remoteOperationCount
) {
  throw new Error("The remote mutation backlog did not converge completely.");
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  configuration: { operationCount, remoteOperationCount, payloadBytes },
  results: {
    pushedMutationCount: convergence.pushedMutationCount,
    pulledMutationCount: convergence.pulledMutationCount,
    finalPulledCursor: convergence.pulledCursor,
    pushedWireBytes,
    operationsPerSecond: Math.round(
      (operationCount + remoteOperationCount) /
        Math.max(elapsedMs / 1000, 0.001),
    ),
  },
  timingsMs: { total: elapsedMs },
  memory: {
    heapUsedBeforeBytes: heapBefore,
    heapUsedAfterBytes: memory.heapUsed,
    heapDeltaBytes: memory.heapUsed - heapBefore,
    rssAfterBytes: memory.rss,
  },
};

database.close();
const outputPath = resolve(
  process.env.LOCAL_FIRST_SYNC_OUTPUT ??
    "test-results/local-first-sync-performance.json",
);
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
