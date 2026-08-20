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

export const IMPORTED_FILE_FINGERPRINT_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/imported-file-fingerprint-index";
export const IMPORTED_FILE_FINGERPRINT_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/imported-file-fingerprint/";
export interface ImportedFileFingerprintEntityFields {
  accountId: string;
  fileHash: string;
  fileName: string;
  importedAt: string;
  transactionCount: number;
}

function validFileFields(fields: Readonly<Record<string, unknown>>): fields is ImportedFileFingerprintEntityFields & Readonly<Record<string, unknown>> {
  return typeof fields.accountId === "string" && fields.accountId.length > 0 &&
    typeof fields.fileHash === "string" && fields.fileHash.length > 0 &&
    typeof fields.fileName === "string" &&
    typeof fields.importedAt === "string" && fields.importedAt.length > 0 &&
    typeof fields.transactionCount === "number" && Number.isInteger(fields.transactionCount) && fields.transactionCount >= 0;
}

export const importedFileFingerprintEntityCodec =
  createJsonReplicatedEntityCodec<ImportedFileFingerprintEntityFields>(validFileFields);
function adapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
}

function indexedRepository<T extends object>({
  storage,
  entityType,
  indexKey,
  codec,
}: {
  storage: KeyValueStoragePort;
  entityType: string;
  indexKey: string;
  codec: ReturnType<typeof createJsonReplicatedEntityCodec<T>>;
}) {
  const base = createEntityRepository<T>({ entityType, storage: adapter(storage), codec });
  const readIds = (): string[] => {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(indexKey) ?? "[]");
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))].sort()
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
    purge(id: string) {
      base.purge(id);
      writeIds(readIds().filter((candidate) => candidate !== id));
    },
  });
}

export function createImportedFileFingerprintRepository(storage: KeyValueStoragePort) {
  return indexedRepository({
    storage,
    entityType: "imported-file-fingerprint",
    indexKey: IMPORTED_FILE_FINGERPRINT_ENTITY_INDEX_KEY,
    codec: importedFileFingerprintEntityCodec,
  });
}

export function importedFileFingerprintEntityId(accountId: string, fileHash: string): string {
  return JSON.stringify([accountId, fileHash]);
}

export function importFingerprintTimestamp(now = new Date(), counter = 0): HybridTimestamp {
  return createHybridTimestamp(now.getTime(), counter, "import-fingerprint-service");
}

function createEntity<T extends object>(id: string, fields: T, timestamp: HybridTimestamp): ReplicatedEntity<T> {
  return Object.freeze({
    metadata: Object.freeze({ id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, createLwwRegister(value, timestamp)]),
    )) as ReplicatedEntity<T>["fields"],
  });
}

function updateEntity<T extends object>(entity: ReplicatedEntity<T>, fields: T, timestamp: HybridTimestamp): ReplicatedEntity<T> {
  const nextFields = Object.fromEntries(Object.entries(fields).map(([key, value]) => {
    const current = entity.fields[key as keyof T];
    return [key, Object.is(current.value, value) ? current : createLwwRegister(value, timestamp)];
  })) as ReplicatedEntity<T>["fields"];
  return Object.freeze({ metadata: entity.metadata, fields: Object.freeze(nextFields) });
}

export function upsertImportedFileFingerprintEntity(
  storage: KeyValueStoragePort,
  fields: ImportedFileFingerprintEntityFields,
  timestamp = importFingerprintTimestamp(),
): ReplicatedEntity<ImportedFileFingerprintEntityFields> {
  const repository = createImportedFileFingerprintRepository(storage);
  const id = importedFileFingerprintEntityId(fields.accountId, fields.fileHash);
  const current = repository.get(id);
  const next = current ? updateEntity(current, fields, timestamp) : createEntity(id, fields, timestamp);
  repository.save(next);
  return next;
}

export function projectEntityFields<T extends object>(entity: ReplicatedEntity<T>): T {
  return Object.fromEntries(Object.entries(entity.fields as Record<string, { readonly value: unknown }>).map(([key, register]) => [key, register.value])) as T;
}
