import assert from "node:assert/strict";
import {
  compareHybridTimestamps,
  createHybridTimestamp,
  createLwwRegister,
  isTombstoned,
  mergeLwwRegisters,
  mergeTombstones,
  parseHybridTimestamp,
  receiveHybridTimestamp,
  HybridClockDriftError,
  serializeHybridTimestamp,
  tickHybridClock,
  type ReplicatedEntity,
} from "../packages/sync/src/index.js";

const a0 = createHybridTimestamp(1_000, 0, "device-a");
const a1 = tickHybridClock(a0, 1_000, "device-a");
assert.deepEqual(a1, { wallTime: 1_000, counter: 1, nodeId: "device-a" });

const afterRollback = tickHybridClock(a1, 900, "device-a");
assert.deepEqual(afterRollback, { wallTime: 1_000, counter: 2, nodeId: "device-a" });

const afterTimeAdvance = tickHybridClock(afterRollback, 1_100, "device-a");
assert.deepEqual(afterTimeAdvance, { wallTime: 1_100, counter: 0, nodeId: "device-a" });

const remote = createHybridTimestamp(1_200, 4, "device-b");
const received = receiveHybridTimestamp(afterTimeAdvance, remote, 1_150, "device-a");
assert.deepEqual(received, { wallTime: 1_200, counter: 5, nodeId: "device-a" });
assert.equal(compareHybridTimestamps(received, remote), 1);

const simultaneousA = createHybridTimestamp(2_000, 0, "device-a");
const simultaneousB = createHybridTimestamp(2_000, 0, "device-b");
assert.equal(compareHybridTimestamps(simultaneousA, simultaneousB), -1);
assert.equal(compareHybridTimestamps(simultaneousB, simultaneousA), 1);

const encoded = serializeHybridTimestamp(createHybridTimestamp(5, 7, "phone/sydney"));
assert.deepEqual(parseHybridTimestamp(encoded), {
  wallTime: 5,
  counter: 7,
  nodeId: "phone/sydney",
});

const oldName = createLwwRegister("Everyday", simultaneousA);
const newName = createLwwRegister("Daily Spending", simultaneousB);
assert.equal(mergeLwwRegisters(oldName, newName).value, "Daily Spending");
assert.equal(mergeLwwRegisters(newName, oldName).value, "Daily Spending");
assert.equal(mergeLwwRegisters(newName, newName), newName);

const collisionLeft = createLwwRegister({ b: 2, a: 1 }, simultaneousA);
const collisionRight = createLwwRegister({ a: 1, b: 3 }, simultaneousA);
assert.deepEqual(
  mergeLwwRegisters(collisionLeft, collisionRight),
  mergeLwwRegisters(collisionRight, collisionLeft),
  "Equal-timestamp corruption must still merge deterministically.",
);

assert.equal(mergeTombstones(null, remote), remote);
assert.equal(mergeTombstones(remote, received), received);
assert.equal(mergeTombstones(received, remote), received);
assert.equal(isTombstoned(null), false);
assert.equal(isTombstoned(received), true);

const account: ReplicatedEntity<{ name: string; closed: boolean }> = {
  metadata: {
    id: "account-1",
    createdAt: a0,
    tombstone: null,
  },
  fields: {
    name: newName,
    closed: createLwwRegister(false, a0),
  },
};
assert.equal(account.fields.name.value, "Daily Spending");

assert.throws(() => createHybridTimestamp(-1, 0, "device-a"), RangeError);
assert.throws(() => createHybridTimestamp(1, 0, " "), TypeError);
assert.throws(() => parseHybridTimestamp("not-a-timestamp"), TypeError);

console.log("PASS: Phase 2 replication primitives are monotonic, deterministic, and tombstone-safe");

assert.throws(
  () => receiveHybridTimestamp(undefined, createHybridTimestamp(400_001, 0, "future"), 100_000, "device-a"),
  HybridClockDriftError,
);
assert.throws(
  () => tickHybridClock(createHybridTimestamp(400_001, 0, "device-a"), 100_000, "device-a"),
  HybridClockDriftError,
);
