import {
  createEntityRepository,
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  type EntityRecordStorage,
  type HybridTimestamp,
  type ReplicatedEntity,
} from "../../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import type {
  TransactionImportProfile,
  TransactionPayeeAlias,
} from "../transactionImport.js";

export const TRANSACTION_PAYEE_ALIAS_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/transaction-payee-alias-index";
export const TRANSACTION_PAYEE_ALIAS_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/transaction-payee-alias/";
export const TRANSACTION_IMPORT_PROFILE_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/transaction-import-profile-index";
export const TRANSACTION_IMPORT_PROFILE_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/transaction-import-profile/";

function storageAdapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
}

function createIndexedRepository<T extends object>({
  storage,
  entityType,
  indexKey,
  validate,
}: {
  storage: KeyValueStoragePort;
  entityType: string;
  indexKey: string;
  validate: (fields: Readonly<Record<string, unknown>>) => fields is T & Readonly<Record<string, unknown>>;
}) {
  const base = createEntityRepository<T>({
    entityType,
    storage: storageAdapter(storage),
    codec: createJsonReplicatedEntityCodec<T>(validate),
  });
  const readIds = (): string[] => {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(indexKey) ?? "[]");
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0))].sort()
        : [];
    } catch {
      return [];
    }
  };
  const writeIds = (ids: readonly string[]) =>
    storage.setItem(indexKey, JSON.stringify([...new Set(ids)].sort()));

  return Object.freeze({
    get: (id: string) => base.get(id),
    save(entity: ReplicatedEntity<T>) {
      base.save(entity);
      writeIds([...readIds(), entity.metadata.id]);
    },
    list(options: { includeTombstoned?: boolean } = {}) {
      return readIds()
        .map((id) => base.get(id))
        .filter((entity): entity is ReplicatedEntity<T> => entity !== null)
        .filter((entity) => options.includeTombstoned || entity.metadata.tombstone === null);
    },
  });
}

function isMapping(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isPayeeAlias = (
  fields: Readonly<Record<string, unknown>>,
): fields is TransactionPayeeAlias & Readonly<Record<string, unknown>> =>
  typeof fields.id === "string" &&
  typeof fields.sourcePayee === "string" &&
  typeof fields.targetPayee === "string" &&
  typeof fields.normalisedSource === "string" &&
  typeof fields.useCount === "number" &&
  typeof fields.createdAt === "string" &&
  typeof fields.updatedAt === "string";

const isImportProfile = (
  fields: Readonly<Record<string, unknown>>,
): fields is TransactionImportProfile & Readonly<Record<string, unknown>> =>
  typeof fields.id === "string" &&
  typeof fields.name === "string" &&
  fields.parserType === "csv" &&
  typeof fields.signature === "string" &&
  isMapping(fields.mapping) &&
  (fields.defaultAccountName === undefined || typeof fields.defaultAccountName === "string") &&
  typeof fields.createdAt === "string" &&
  typeof fields.updatedAt === "string";

export const createTransactionPayeeAliasEntityRepository = (storage: KeyValueStoragePort) =>
  createIndexedRepository<TransactionPayeeAlias>({
    storage,
    entityType: "transaction-payee-alias",
    indexKey: TRANSACTION_PAYEE_ALIAS_ENTITY_INDEX_KEY,
    validate: isPayeeAlias,
  });

export const createTransactionImportProfileEntityRepository = (storage: KeyValueStoragePort) =>
  createIndexedRepository<TransactionImportProfile>({
    storage,
    entityType: "transaction-import-profile",
    indexKey: TRANSACTION_IMPORT_PROFILE_ENTITY_INDEX_KEY,
    validate: isImportProfile,
  });

export function importPreferenceTimestamp(now = new Date(), counter = 0): HybridTimestamp {
  return createHybridTimestamp(now.getTime(), counter, "import-preference-service");
}

function project<T extends object>(entity: ReplicatedEntity<T>): T {
  return Object.fromEntries(
    Object.entries(entity.fields as Record<string, { readonly value: unknown }>).map(([key, register]) => [key, register.value]),
  ) as T;
}

function createEntity<T extends object>(id: string, fields: T, timestamp: HybridTimestamp): ReplicatedEntity<T> {
  return Object.freeze({
    metadata: Object.freeze({ id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, createLwwRegister(value, timestamp)]),
      ),
    ) as ReplicatedEntity<T>["fields"],
  });
}

function updateEntity<T extends object>(entity: ReplicatedEntity<T>, fields: T, timestamp: HybridTimestamp): ReplicatedEntity<T> {
  return Object.freeze({
    metadata: Object.freeze({ ...entity.metadata, tombstone: null }),
    fields: Object.freeze(
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => {
          const current = entity.fields[key as keyof T];
          return [key, JSON.stringify(current?.value) === JSON.stringify(value) ? current : createLwwRegister(value, timestamp)];
        }),
      ),
    ) as ReplicatedEntity<T>["fields"],
  });
}

function replaceEntities<T extends { id: string }>(
  repository: ReturnType<typeof createIndexedRepository<T>>,
  values: readonly T[],
  now: Date,
): void {
  const retained = new Set(values.map((value) => value.id));
  let counter = 0;
  for (const entity of repository.list({ includeTombstoned: true })) {
    if (!retained.has(entity.metadata.id) && entity.metadata.tombstone === null) {
      repository.save(Object.freeze({
        metadata: Object.freeze({ ...entity.metadata, tombstone: importPreferenceTimestamp(now, counter++) }),
        fields: entity.fields,
      }));
    }
  }
  for (const value of values) {
    const timestamp = importPreferenceTimestamp(now, counter++);
    const current = repository.get(value.id);
    repository.save(current ? updateEntity(current, value, timestamp) : createEntity(value.id, value, timestamp));
  }
}

export function readTransactionPayeeAliasEntities(storage: KeyValueStoragePort): TransactionPayeeAlias[] {
  return createTransactionPayeeAliasEntityRepository(storage).list().map(project);
}

export function replaceTransactionPayeeAliasEntities(
  storage: KeyValueStoragePort,
  aliases: readonly TransactionPayeeAlias[],
  now = new Date(),
): void {
  replaceEntities(createTransactionPayeeAliasEntityRepository(storage), aliases, now);
}

export function readTransactionImportProfileEntities(storage: KeyValueStoragePort): TransactionImportProfile[] {
  return createTransactionImportProfileEntityRepository(storage).list().map(project);
}

export function replaceTransactionImportProfileEntities(
  storage: KeyValueStoragePort,
  profiles: readonly TransactionImportProfile[],
  now = new Date(),
): void {
  replaceEntities(createTransactionImportProfileEntityRepository(storage), profiles, now);
}
