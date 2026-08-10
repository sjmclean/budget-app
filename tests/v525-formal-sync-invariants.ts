import assert from "node:assert/strict";
import {
  compareHybridTimestamps,
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  mergeLwwRegisters,
  mergeSerializedEntityRecords,
  receiveHybridTimestamp,
  tickHybridClock,
  type ReplicatedEntity,
} from "../packages/sync/src/index.js";
import {
  applyOperationsToCheckpointEntries,
  calculateCheckpointIntegrityHash,
  createPersistenceCheckpoint,
} from "../apps/web/src/features/persistence/checkpoint.js";
import { createOperationJournalEntry } from "../apps/web/src/features/persistence/operationJournal.js";

type Fields = { name: string; note: string; hidden: boolean; amount: number };
const codec = createJsonReplicatedEntityCodec<Fields>();

function envelope(entity: ReplicatedEntity<Fields>): string {
  return JSON.stringify({ schemaVersion: 1, entityType: "formal-invariant", payload: codec.serialize(entity) });
}
function decode(raw: string): ReplicatedEntity<Fields> {
  return codec.deserialize((JSON.parse(raw) as { payload: string }).payload);
}
function merge(left: string, right: string): string {
  const merged = mergeSerializedEntityRecords(left, right);
  assert.ok(merged, "compatible replicated entities must merge");
  return merged;
}
function canonical(raw: string): string {
  return JSON.stringify(decode(raw));
}

// HLC total ordering and local/receive monotonicity.
{
  const a = createHybridTimestamp(1_000, 0, "a");
  const b = createHybridTimestamp(1_000, 0, "b");
  const c = createHybridTimestamp(1_000, 1, "a");
  assert.equal(compareHybridTimestamps(a, a), 0, "timestamp equality is reflexive");
  assert.equal(compareHybridTimestamps(a, b), -compareHybridTimestamps(b, a), "timestamp ordering is antisymmetric");
  assert.equal(compareHybridTimestamps(a, b) < 0 && compareHybridTimestamps(b, c) < 0, true);
  assert.equal(compareHybridTimestamps(a, c) < 0, true, "timestamp ordering is transitive");

  const ticked = tickHybridClock(a, 900, "a");
  assert.equal(compareHybridTimestamps(ticked, a) > 0, true, "local clock never moves backwards");
  const received = receiveHybridTimestamp(ticked, c, 950, "a");
  assert.equal(compareHybridTimestamps(received, ticked) > 0, true, "receive advances beyond local time");
  assert.equal(compareHybridTimestamps(received, c) > 0, true, "receive advances beyond remote time");
}

// LWW registers form a deterministic commutative, associative and idempotent join.
{
  const t1 = createHybridTimestamp(2_000, 0, "a");
  const t2 = createHybridTimestamp(2_000, 0, "b");
  const t3 = createHybridTimestamp(2_001, 0, "a");
  const a = createLwwRegister("alpha", t1);
  const b = createLwwRegister("beta", t2);
  const c = createLwwRegister("gamma", t3);
  assert.deepEqual(mergeLwwRegisters(a, b), mergeLwwRegisters(b, a), "register merge is commutative");
  assert.deepEqual(
    mergeLwwRegisters(mergeLwwRegisters(a, b), c),
    mergeLwwRegisters(a, mergeLwwRegisters(b, c)),
    "register merge is associative",
  );
  assert.deepEqual(mergeLwwRegisters(a, a), a, "register merge is idempotent");
  assert.deepEqual(mergeLwwRegisters(a, c), c, "newer register wins");
}

// Replicated entities retain the join laws and preserve the greatest tombstone.
{
  const created = createHybridTimestamp(3_000, 0, "origin");
  const base: ReplicatedEntity<Fields> = Object.freeze({
    metadata: Object.freeze({ id: "entity-1", createdAt: created, tombstone: null }),
    fields: Object.freeze({
      name: createLwwRegister("Initial", created),
      note: createLwwRegister("", created),
      hidden: createLwwRegister(false, created),
      amount: createLwwRegister(0, created),
    }),
  });
  const editA: ReplicatedEntity<Fields> = Object.freeze({
    ...base,
    fields: Object.freeze({ ...base.fields, note: createLwwRegister("from-a", createHybridTimestamp(3_100, 0, "a")) }),
  });
  const editB: ReplicatedEntity<Fields> = Object.freeze({
    ...base,
    fields: Object.freeze({ ...base.fields, amount: createLwwRegister(42, createHybridTimestamp(3_100, 0, "b")) }),
  });
  const deleted: ReplicatedEntity<Fields> = Object.freeze({
    ...base,
    metadata: Object.freeze({ ...base.metadata, tombstone: createHybridTimestamp(3_200, 0, "c") }),
  });
  const a = envelope(editA);
  const b = envelope(editB);
  const c = envelope(deleted);

  assert.equal(canonical(merge(a, b)), canonical(merge(b, a)), "entity merge is commutative");
  assert.equal(canonical(merge(merge(a, b), c)), canonical(merge(a, merge(b, c))), "entity merge is associative");
  assert.equal(canonical(merge(a, a)), canonical(a), "entity merge is idempotent");

  const joined = decode(merge(merge(a, b), c));
  assert.equal(joined.fields.note.value, "from-a", "independent field A survives");
  assert.equal(joined.fields.amount.value, 42, "independent field B survives");
  assert.notEqual(joined.metadata.tombstone, null, "observed tombstone cannot be lost");
  assert.notEqual(decode(merge(envelope(base), c)).metadata.tombstone, null, "older live state cannot resurrect a deletion");
}

// Canonical state hashes are independent of insertion order and stable through checkpoint creation.
{
  const entriesA = { z: "last", a: "first", m: "middle" };
  const entriesB = { m: "middle", z: "last", a: "first" };
  assert.equal(calculateCheckpointIntegrityHash(entriesA), calculateCheckpointIntegrityHash(entriesB), "state hash is key-order independent");

  const checkpointA = createPersistenceCheckpoint({
    checkpointId: "formal-a", deviceId: "device", throughSequence: 7, schemaVersion: 4,
    replicatedThroughCursor: 11, entries: entriesA, createdAt: new Date(0),
  });
  const checkpointB = createPersistenceCheckpoint({
    checkpointId: "formal-b", deviceId: "device", throughSequence: 7, schemaVersion: 4,
    replicatedThroughCursor: 11, entries: entriesB, createdAt: new Date(0),
  });
  assert.deepEqual(checkpointA.entries, checkpointB.entries, "checkpoint canonicalisation is deterministic");
  assert.equal(checkpointA.integrityHash, checkpointB.integrityHash, "equivalent checkpoints share a hash");
  assert.equal(calculateCheckpointIntegrityHash(checkpointA.entries), checkpointA.integrityHash, "checkpoint round-trip preserves hash");
}

// Journal replay is deterministic and idempotent, including duplicate operation IDs.
{
  const set = createOperationJournalEntry({
    deviceId: "device-a", sequence: 1, operationId: "op-set", now: new Date(1_000),
    mutation: { type: "key-value.set", key: "account/1", value: "open" },
  });
  const remove = createOperationJournalEntry({
    deviceId: "device-a", sequence: 2, operationId: "op-remove", now: new Date(2_000),
    mutation: { type: "key-value.remove", key: "account/1" },
  });
  const expected = applyOperationsToCheckpointEntries(
    createPersistenceCheckpoint({ checkpointId: "base", deviceId: "device", throughSequence: 0, schemaVersion: 4, entries: {}, createdAt: new Date(0) }),
    [set, remove],
  );
  const replayed = applyOperationsToCheckpointEntries(
    createPersistenceCheckpoint({ checkpointId: "base-replay", deviceId: "device", throughSequence: 0, schemaVersion: 4, entries: {}, createdAt: new Date(0) }),
    [set, set, remove, remove],
  );
  assert.deepEqual(replayed, expected, "duplicate journal replay is idempotent");
  assert.equal(calculateCheckpointIntegrityHash(replayed), calculateCheckpointIntegrityHash(expected), "replay preserves canonical state hash");
}

// Cursor progress is a monotone lattice under component-wise maximum.
{
  type Cursor = { pushedLocalSequence: number; pulledRemoteCursor: number };
  const joinCursor = (left: Cursor, right: Cursor): Cursor => ({
    pushedLocalSequence: Math.max(left.pushedLocalSequence, right.pushedLocalSequence),
    pulledRemoteCursor: Math.max(left.pulledRemoteCursor, right.pulledRemoteCursor),
  });
  const a = { pushedLocalSequence: 4, pulledRemoteCursor: 9 };
  const b = { pushedLocalSequence: 7, pulledRemoteCursor: 3 };
  const c = { pushedLocalSequence: 5, pulledRemoteCursor: 12 };
  assert.deepEqual(joinCursor(a, b), joinCursor(b, a), "cursor join is commutative");
  assert.deepEqual(joinCursor(joinCursor(a, b), c), joinCursor(a, joinCursor(b, c)), "cursor join is associative");
  assert.deepEqual(joinCursor(a, a), a, "cursor join is idempotent");
  const joined = joinCursor(joinCursor(a, b), c);
  assert.equal(joined.pushedLocalSequence >= a.pushedLocalSequence, true, "push cursor never regresses");
  assert.equal(joined.pulledRemoteCursor >= c.pulledRemoteCursor, true, "pull cursor never regresses");
}

console.log("v525 formal sync invariants: pass (HLC, LWW, entity, tombstone, checkpoint, replay, cursor)");
