import assert from "node:assert/strict";
import test from "node:test";
import { selectOutboxPushBatch } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";

function row(sequence: number, payloadBytes: number, operationGroupJson?: string) {
  return {
    sequence, mutationId: `mutation-${sequence}`, operationGroupId: operationGroupJson ? `group-${sequence}` : null,
    operationGroupJson: operationGroupJson ?? null, deviceId: "device", deviceSequence: sequence,
    baseCursor: 0, domain: "attachments" as const, entityId: `attachment-${sequence}`,
    operation: "upsert" as const, payloadJson: JSON.stringify({ contentBase64: "x".repeat(payloadBytes) }),
    createdAt: "2026-09-19T00:00:00.000Z",
  };
}

test("outbox batching counts the complete serialized relay request, including operation groups", () => {
  const groupJson = JSON.stringify({ kind: "atomic", members: [{ payload: "g".repeat(2048) }] });
  const selected = selectOutboxPushBatch([row(1, 1024, groupJson)], "budget", "epoch");
  const actualRequestBytes = new TextEncoder().encode(JSON.stringify({ budgetId: "budget", syncEpoch: "epoch", mutations: selected.mutations })).byteLength;
  assert.ok(selected.encodedBytes >= actualRequestBytes);
  assert.equal((selected.mutations[0]!.operationGroup!.members[0] as { payload: string }).payload, "g".repeat(2048));
});

test("multiple large mutations split before the 32 MiB target", () => {
  const selected = selectOutboxPushBatch([row(1, 17 * 1024 * 1024), row(2, 17 * 1024 * 1024)], "budget", "epoch");
  assert.equal(selected.rows.length, 1);
  assert.ok(selected.encodedBytes <= 32 * 1024 * 1024);
});

test("one legal oversized row remains sendable and below the server limit", () => {
  const selected = selectOutboxPushBatch([row(1, 33 * 1024 * 1024)], "budget", "epoch");
  assert.equal(selected.rows.length, 1);
  assert.ok(selected.encodedBytes > 32 * 1024 * 1024);
  assert.ok(selected.encodedBytes < 50 * 1024 * 1024);
});

test("a near-maximum attachment payload is selected without duplicating group metadata", () => {
  const selected = selectOutboxPushBatch([row(1, 5 * 1024 * 1024)], "budget", "epoch");
  assert.equal(selected.rows.length, 1);
  assert.equal(selected.mutations[0]!.operationGroup, undefined);
});
