import assert from "node:assert/strict";
import {
  createEntityRepository,
  createHybridTimestamp,
  createInMemoryEntityRecordStorage,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  EntityRepositoryCorruptionError,
  type ReplicatedEntity,
} from "../packages/sync/src/index.js";

type AccountFields = {
  name: string;
  closed: boolean;
};

function isAccountFields(fields: Readonly<Record<string, unknown>>): fields is AccountFields {
  return typeof fields.name === "string" && typeof fields.closed === "boolean";
}

const timestamp = createHybridTimestamp(1_000, 0, "device-a");
const laterTimestamp = createHybridTimestamp(2_000, 0, "device-b");
const codec = createJsonReplicatedEntityCodec<AccountFields>(isAccountFields);
const storage = createInMemoryEntityRecordStorage({
  "unrelated/local-key": "preserve me",
});
const repository = createEntityRepository({
  entityType: "account",
  storage,
  codec,
});

const everyday: ReplicatedEntity<AccountFields> = {
  metadata: {
    id: "account/everyday",
    createdAt: timestamp,
    tombstone: null,
  },
  fields: {
    name: createLwwRegister("Everyday", timestamp),
    closed: createLwwRegister(false, timestamp),
  },
};

const savings: ReplicatedEntity<AccountFields> = {
  metadata: {
    id: "account-savings",
    createdAt: timestamp,
    tombstone: laterTimestamp,
  },
  fields: {
    name: createLwwRegister("Savings", timestamp),
    closed: createLwwRegister(true, laterTimestamp),
  },
};

assert.equal(repository.get(everyday.metadata.id), null);
assert.equal(repository.has(everyday.metadata.id), false);
repository.save(everyday);
repository.save(savings);

assert.equal(repository.has(everyday.metadata.id), true);
assert.deepEqual(repository.get(everyday.metadata.id), everyday);
assert.deepEqual(repository.list().map((entity) => entity.metadata.id), ["account/everyday"]);
assert.deepEqual(
  repository.list({ includeTombstoned: true }).map((entity) => entity.metadata.id),
  ["account-savings", "account/everyday"],
);
assert.equal(storage.getItem("unrelated/local-key"), "preserve me");
assert.ok(
  storage.listKeys().some((key) => key.endsWith("account%2Feveryday")),
  "Entity IDs must be safely encoded into independently addressable record keys.",
);

const loaded = repository.get(everyday.metadata.id);
assert.ok(loaded);
assert.notEqual(loaded, everyday, "Repository reads must decode persisted records rather than return shared references.");
assert.equal(Object.isFrozen(loaded.metadata), true);
assert.equal(Object.isFrozen(loaded.fields), true);

repository.purge(savings.metadata.id);
assert.equal(repository.has(savings.metadata.id), false);
assert.deepEqual(repository.list({ includeTombstoned: true }), [loaded]);
await repository.flush();

assert.throws(
  () => createEntityRepository({ entityType: " ", storage, codec }),
  TypeError,
);
assert.throws(() => repository.get(" "), TypeError);

const corruptStorage = createInMemoryEntityRecordStorage({
  "budget-app.entity-replication.v1/account/bad": JSON.stringify({
    schemaVersion: 1,
    entityType: "account",
    payload: "not-json",
  }),
});
const corruptRepository = createEntityRepository({ entityType: "account", storage: corruptStorage, codec });
assert.throws(() => corruptRepository.get("bad"), EntityRepositoryCorruptionError);

const mismatchedStorage = createInMemoryEntityRecordStorage();
const mismatchedRepository = createEntityRepository({ entityType: "account", storage: mismatchedStorage, codec });
mismatchedStorage.setItem(
  "budget-app.entity-replication.v1/account/key-id",
  JSON.stringify({
    schemaVersion: 1,
    entityType: "account",
    payload: codec.serialize({
      ...everyday,
      metadata: { ...everyday.metadata, id: "payload-id" },
    }),
  }),
);
assert.throws(() => mismatchedRepository.get("key-id"), EntityRepositoryCorruptionError);

const invalidDomainStorage = createInMemoryEntityRecordStorage();
const invalidDomainRepository = createEntityRepository({ entityType: "account", storage: invalidDomainStorage, codec });
invalidDomainStorage.setItem(
  "budget-app.entity-replication.v1/account/invalid-fields",
  JSON.stringify({
    schemaVersion: 1,
    entityType: "account",
    payload: JSON.stringify({
      metadata: everyday.metadata,
      fields: {
        name: createLwwRegister(123, timestamp),
        closed: createLwwRegister(false, timestamp),
      },
    }),
  }),
);
assert.throws(() => invalidDomainRepository.get("invalid-fields"), EntityRepositoryCorruptionError);

console.log("PASS: Phase 3 entity repository persists, validates, lists, and isolates entity records");
