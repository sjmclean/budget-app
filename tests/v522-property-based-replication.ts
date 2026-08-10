import assert from "node:assert/strict";
import { createHybridTimestamp } from "../packages/sync/src/primitives/HybridTimestamp.js";
import { createLwwRegister } from "../packages/sync/src/primitives/LwwRegister.js";
import type { ReplicatedEntity } from "../packages/sync/src/primitives/ReplicatedEntity.js";
import { createJsonReplicatedEntityCodec } from "../packages/sync/src/entityRepository/ReplicatedEntityCodec.js";
import { mergeSerializedEntityRecords } from "../packages/sync/src/entityRepository/EntityRepository.js";

type Fields = { name: string; note: string; hidden: boolean; amount: number };
type MutableEntity = ReplicatedEntity<Fields>;
const codec = createJsonReplicatedEntityCodec<Fields>();

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}
function envelope(entity: MutableEntity): string {
  return JSON.stringify({ schemaVersion: 1, entityType: "property-test", payload: codec.serialize(entity) });
}
function decode(raw: string): MutableEntity {
  return codec.deserialize((JSON.parse(raw) as { payload: string }).payload);
}
function canonical(raw: string): string {
  return JSON.stringify(decode(raw));
}
function merge(left: string, right: string): string {
  const result = mergeSerializedEntityRecords(left, right);
  assert.ok(result, "replicated entity records must merge");
  return result!;
}
function shuffled<T>(random: () => number, input: readonly T[]): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

const fields = ["name", "note", "hidden", "amount"] as const;
const devices = ["device-a", "device-b", "device-c", "device-d"] as const;
const RUNS = Number(process.env.PROPERTY_RUNS ?? 250);
const OPERATIONS = Number(process.env.PROPERTY_OPERATIONS ?? 80);
assert.ok(Number.isInteger(RUNS) && RUNS > 0);
assert.ok(Number.isInteger(OPERATIONS) && OPERATIONS > 0);

for (let seed = 1; seed <= RUNS; seed += 1) {
  const random = rng(seed);
  const createdAt = createHybridTimestamp(1_000_000 + seed, 0, "origin");
  const base: MutableEntity = Object.freeze({
    metadata: Object.freeze({ id: `entity-${seed}`, createdAt, tombstone: null }),
    fields: Object.freeze({
      name: createLwwRegister("Initial", createdAt),
      note: createLwwRegister("", createdAt),
      hidden: createLwwRegister(false, createdAt),
      amount: createLwwRegister(0, createdAt),
    }),
  });
  const writes: string[] = [envelope(base)];
  const counters = new Map<string, number>();

  for (let operation = 0; operation < OPERATIONS; operation += 1) {
    const device = pick(random, devices);
    const counter = (counters.get(device) ?? 0) + 1;
    counters.set(device, counter);
    const timestamp = createHybridTimestamp(1_001_000 + operation + Math.floor(random() * 7), counter, device);
    const previous = decode(pick(random, writes));

    if (random() < 0.12) {
      writes.push(envelope(Object.freeze({
        ...previous,
        metadata: Object.freeze({ ...previous.metadata, tombstone: timestamp }),
      })));
      continue;
    }

    const field = pick(random, fields);
    const value = field === "name"
      ? `Name ${seed}-${operation}`
      : field === "note"
        ? `Note ${device}-${operation}`
        : field === "hidden"
          ? random() >= 0.5
          : Math.floor(random() * 2_000_001) - 1_000_000;
    writes.push(envelope(Object.freeze({
      ...previous,
      fields: Object.freeze({ ...previous.fields, [field]: createLwwRegister(value, timestamp) }),
    }) as MutableEntity));
  }

  const expected = writes.reduce(merge);
  const expectedCanonical = canonical(expected);

  // Commutativity, associativity and idempotency are the core join properties.
  for (let check = 0; check < 20; check += 1) {
    const a = pick(random, writes);
    const b = pick(random, writes);
    const c = pick(random, writes);
    assert.equal(canonical(merge(a, b)), canonical(merge(b, a)), `seed ${seed}: commutativity`);
    assert.equal(canonical(merge(merge(a, b), c)), canonical(merge(a, merge(b, c))), `seed ${seed}: associativity`);
    assert.equal(canonical(merge(a, a)), canonical(a), `seed ${seed}: idempotency`);
  }

  // Every delivery order, including duplicates, must converge to the same state.
  for (let replica = 0; replica < 6; replica += 1) {
    const deliveries = shuffled(random, [...writes, ...writes.filter(() => random() < 0.35)]);
    const result = deliveries.reduce(merge);
    assert.equal(canonical(result), expectedCanonical, `seed ${seed}: replica ${replica} did not converge`);
  }

  // Once observed, the greatest tombstone cannot be lost by older/live records.
  const tombstones = writes.map(decode).map((entity) => entity.metadata.tombstone).filter((value) => value !== null);
  if (tombstones.length > 0) {
    assert.notEqual(decode(expected).metadata.tombstone, null, `seed ${seed}: tombstone resurrected`);
  }
}

console.log(`v522 property-based replication: pass (${RUNS} seeds × ${OPERATIONS} operations)`);
