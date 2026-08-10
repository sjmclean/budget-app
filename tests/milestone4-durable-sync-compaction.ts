import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LocalBudgetDatabaseClient } from
  "../apps/web/src/features/persistence/localFirst/localBudgetClient";

class WorkerHarness {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: unknown[] = [];

  postMessage(request: { requestId: string; type: string }) {
    this.requests.push(request);
    queueMicrotask(() => this.onmessage?.({
      data: {
        requestId: request.requestId,
        ok: true,
        result: request.type === "getSyncState"
          ? {
              budgetId: "budget",
              syncEpoch: "epoch",
              baselineHash: `sha256:${"a".repeat(64)}`,
              pulledCursor: 41,
            }
          : {},
      },
    } as MessageEvent));
  }

  terminate() {}
}

const worker = new WorkerHarness();
const client = new LocalBudgetDatabaseClient(worker as unknown as Worker);
const mutation = {
  mutationId: "mutation-42",
  budgetId: "budget",
  syncEpoch: "epoch",
  deviceId: "device",
  deviceSequence: 42,
  domain: "transactions" as const,
  entityId: "transaction",
  operation: "delete" as const,
  payload: null,
  createdAt: new Date(0).toISOString(),
};
await client.applyRemoteMutations([{ cursor: 42, mutation }], 42);
assert.deepEqual(worker.requests.at(-1), {
  requestId: (worker.requests.at(-1) as { requestId: string }).requestId,
  type: "applyRemoteMutations",
  mutations: [{ cursor: 42, mutation }],
  throughCursor: 42,
});
assert.equal((await client.getSyncState()).pulledCursor, 41);

const workerSource = await readFile(
  new URL(
    "../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);
const applyStart = workerSource.indexOf("function applyRemoteMutations");
const applyEnd = workerSource.indexOf("function readPulledCursor", applyStart);
const atomicApply = workerSource.slice(applyStart, applyEnd);
assert.ok(atomicApply.indexOf('execute("BEGIN IMMEDIATE")') >= 0);
assert.ok(
  atomicApply.indexOf('writeMetadata("pulledCursor"') <
    atomicApply.indexOf('execute("COMMIT")'),
  "the durable cursor must commit in the same transaction as remote mutations",
);
assert.match(
  workerSource,
  /DELETE FROM local_budget_outbox WHERE sequence <= \?/,
);

console.log(
  "Milestone 4 durable sync cursor and local outbox compaction passed.",
);
