import assert from "node:assert/strict";
import {
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  mergeSerializedEntityRecords,
  type ReplicatedEntity,
} from "../packages/sync/src/index.js";

type Fields = { name: string; note: string; hidden: boolean };
const codec = createJsonReplicatedEntityCodec<Fields>();
const keyEnvelope = (entity: ReplicatedEntity<Fields>) => JSON.stringify({
  schemaVersion: 1,
  entityType: "category",
  payload: codec.serialize(entity),
});
const decode = (raw: string) => {
  const envelope = JSON.parse(raw) as { payload: string };
  return codec.deserialize(envelope.payload);
};

const created = createHybridTimestamp(1_000, 0, "device-a");
const localNote = createHybridTimestamp(2_000, 0, "device-a");
const remoteHidden = createHybridTimestamp(2_100, 0, "device-b");
const remoteName = createHybridTimestamp(2_200, 0, "device-b");

const base: ReplicatedEntity<Fields> = Object.freeze({
  metadata: Object.freeze({ id: "category-1", createdAt: created, tombstone: null }),
  fields: Object.freeze({
    name: createLwwRegister("Everyday", created),
    note: createLwwRegister("", created),
    hidden: createLwwRegister(false, created),
  }),
});
const local: ReplicatedEntity<Fields> = Object.freeze({
  ...base,
  fields: Object.freeze({ ...base.fields, note: createLwwRegister("Local note", localNote) }),
});
const remoteDifferentField: ReplicatedEntity<Fields> = Object.freeze({
  ...base,
  fields: Object.freeze({ ...base.fields, hidden: createLwwRegister(true, remoteHidden) }),
});

const mergedDifferentFieldsRaw = mergeSerializedEntityRecords(
  keyEnvelope(local),
  keyEnvelope(remoteDifferentField),
);
assert.ok(mergedDifferentFieldsRaw);
const mergedDifferentFields = decode(mergedDifferentFieldsRaw!);
assert.equal(mergedDifferentFields.fields.note.value, "Local note");
assert.equal(mergedDifferentFields.fields.hidden.value, true);
assert.equal(mergedDifferentFields.fields.name.value, "Everyday");

const remoteSameField: ReplicatedEntity<Fields> = Object.freeze({
  ...base,
  fields: Object.freeze({ ...base.fields, name: createLwwRegister("Remote name", remoteName) }),
});
const localSameField: ReplicatedEntity<Fields> = Object.freeze({
  ...base,
  fields: Object.freeze({ ...base.fields, name: createLwwRegister("Local name", localNote) }),
});
const forward = mergeSerializedEntityRecords(keyEnvelope(localSameField), keyEnvelope(remoteSameField));
const reverse = mergeSerializedEntityRecords(keyEnvelope(remoteSameField), keyEnvelope(localSameField));
assert.ok(forward);
assert.ok(reverse);
assert.equal(decode(forward!).fields.name.value, "Remote name");
assert.deepEqual(decode(forward), decode(reverse!));

const deleted: ReplicatedEntity<Fields> = Object.freeze({
  ...base,
  metadata: Object.freeze({ ...base.metadata, tombstone: remoteName }),
});
const mergedDelete = mergeSerializedEntityRecords(keyEnvelope(local), keyEnvelope(deleted));
assert.ok(mergedDelete);
assert.deepEqual(decode(mergedDelete!).metadata.tombstone, remoteName);

assert.equal(mergeSerializedEntityRecords('{"ordinary":true}', keyEnvelope(local)), null);
console.log("v519 replicated entity convergence: pass");
