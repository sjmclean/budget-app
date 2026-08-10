import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  createReplicationStore,
  REPLICATION_PROTOCOL_VERSION,
} from "../apps/server/src/replicationStore.mjs";

const directory = mkdtempSync(join(tmpdir(), "budget-replication-"));
const database = new Database(":memory:");
const store = createReplicationStore(database, { blobDirectory: directory });

assert.equal(REPLICATION_PROTOCOL_VERSION, 2);
const first = store.getGeneration("budget-a");
const second = store.getGeneration("budget-b");
assert.notEqual(first.generationId, second.generationId);

const operation = (budgetId, operationId, sequence) => ({
  formatVersion: 1,
  operationId,
  deviceId: "device-1",
  sequence,
  createdAt: "2026-07-29T00:00:00.000Z",
  mutation: {
    type: "key-value.set",
    key: `budget-app.budgets.${budgetId}.budget-app.accounts.v1`,
    value: "[]",
  },
});

store.pushOperations("budget-a", first.generationId, [
  operation("budget-a", "operation-a", 1),
]);
store.pushOperations("budget-b", second.generationId, [
  operation("budget-b", "operation-b", 1),
]);

assert.deepEqual(
  store.pullOperations("budget-a", first.generationId, 0, 100)
    .operations.map(({ operation: row }) => row.operationId),
  ["operation-a"],
);
assert.deepEqual(
  store.pullOperations("budget-b", second.generationId, 0, 100)
    .operations.map(({ operation: row }) => row.operationId),
  ["operation-b"],
);
assert.throws(
  () => store.pushOperations("budget-a", first.generationId, [
    operation("budget-b", "cross-budget", 2),
  ]),
  (error) => error.code === "REPLICATION_KEY_OUT_OF_SCOPE",
);

const content = Buffer.from("budget-a attachment");
const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
store.saveBlob(
  "budget-a",
  first.generationId,
  contentHash,
  "text/plain",
  content,
);
assert.equal(store.hasBlob("budget-a", first.generationId, contentHash), true);
assert.equal(store.hasBlob("budget-b", second.generationId, contentHash), false);

database.close();
rmSync(directory, { recursive: true, force: true });
console.log("Milestone 3 budget-scoped replication isolation passed.");
