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
import type { TransactionImportSessionSnapshot } from "../transactionImportSession.js";

export const TRANSACTION_IMPORT_SESSION_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/transaction-import-session-index";
export const TRANSACTION_IMPORT_SESSION_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/transaction-import-session/";

function storageAdapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isTransactionImportSession = (
  fields: Readonly<Record<string, unknown>>,
): fields is TransactionImportSessionSnapshot & Readonly<Record<string, unknown>> =>
  fields.version === 1 &&
  typeof fields.accountId === "string" &&
  typeof fields.savedAt === "string" &&
  (fields.fileName === null || typeof fields.fileName === "string") &&
  (fields.fileType === "csv" || fields.fileType === "qif" || fields.fileType === "ofx" || fields.fileType === "qfx") &&
  isRecord(fields.mapping) &&
  isRecord(fields.preview) &&
  Array.isArray(fields.candidates) &&
  isRecord(fields.bankCandidateDetails) &&
  Array.isArray(fields.processedCandidates) &&
  isRecord(fields.matchEditorOrigins) &&
  isRecord(fields.matchedTransactionOrigins) &&
  typeof fields.previouslyImportedCount === "number" &&
  typeof fields.alreadyRepresentedCount === "number" &&
  typeof fields.excludeMemos === "boolean" &&
  typeof fields.updateMatchedTransactionDates === "boolean";

function readIds(storage: KeyValueStoragePort): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(TRANSACTION_IMPORT_SESSION_ENTITY_INDEX_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0))].sort()
      : [];
  } catch {
    return [];
  }
}

function writeIds(storage: KeyValueStoragePort, ids: readonly string[]): void {
  storage.setItem(TRANSACTION_IMPORT_SESSION_ENTITY_INDEX_KEY, JSON.stringify([...new Set(ids)].sort()));
}

export function createTransactionImportSessionEntityRepository(storage: KeyValueStoragePort) {
  const base = createEntityRepository<TransactionImportSessionSnapshot>({
    entityType: "transaction-import-session",
    storage: storageAdapter(storage),
    codec: createJsonReplicatedEntityCodec<TransactionImportSessionSnapshot>(isTransactionImportSession),
  });

  return Object.freeze({
    get: (id: string) => base.get(id),
    save(entity: ReplicatedEntity<TransactionImportSessionSnapshot>) {
      base.save(entity);
      writeIds(storage, [...readIds(storage), entity.metadata.id]);
    },
    list(options: { includeTombstoned?: boolean } = {}) {
      return readIds(storage)
        .map((id) => base.get(id))
        .filter((entity): entity is ReplicatedEntity<TransactionImportSessionSnapshot> => entity !== null)
        .filter((entity) => options.includeTombstoned || entity.metadata.tombstone === null);
    },
  });
}

export function importSessionTimestamp(now = new Date(), counter = 0): HybridTimestamp {
  return createHybridTimestamp(now.getTime(), counter, "import-session-service");
}

function project(entity: ReplicatedEntity<TransactionImportSessionSnapshot>): TransactionImportSessionSnapshot {
  return Object.fromEntries(
    Object.entries(entity.fields).map(([key, register]) => [key, register.value]),
  ) as unknown as TransactionImportSessionSnapshot;
}

function createEntity(
  value: TransactionImportSessionSnapshot,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionImportSessionSnapshot> {
  return Object.freeze({
    metadata: Object.freeze({ id: value.accountId, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, fieldValue]) => [key, createLwwRegister(fieldValue, timestamp)]),
      ),
    ) as ReplicatedEntity<TransactionImportSessionSnapshot>["fields"],
  });
}

function updateEntity(
  current: ReplicatedEntity<TransactionImportSessionSnapshot>,
  value: TransactionImportSessionSnapshot,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionImportSessionSnapshot> {
  return Object.freeze({
    metadata: Object.freeze({ ...current.metadata, tombstone: null }),
    fields: Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, fieldValue]) => {
          const register = current.fields[key as keyof TransactionImportSessionSnapshot];
          return [
            key,
            register && JSON.stringify(register.value) === JSON.stringify(fieldValue)
              ? register
              : createLwwRegister(fieldValue, timestamp),
          ];
        }),
      ),
    ) as ReplicatedEntity<TransactionImportSessionSnapshot>["fields"],
  });
}

export function readTransactionImportSessionEntity(
  storage: KeyValueStoragePort,
  accountId: string,
): TransactionImportSessionSnapshot | null {
  const entity = createTransactionImportSessionEntityRepository(storage).get(accountId);
  return entity && entity.metadata.tombstone === null ? project(entity) : null;
}

export function writeTransactionImportSessionEntity(
  storage: KeyValueStoragePort,
  session: TransactionImportSessionSnapshot,
  now = new Date(),
): void {
  const repository = createTransactionImportSessionEntityRepository(storage);
  const current = repository.get(session.accountId);
  const timestamp = importSessionTimestamp(now);
  repository.save(current ? updateEntity(current, session, timestamp) : createEntity(session, timestamp));
}

export function tombstoneTransactionImportSessionEntity(
  storage: KeyValueStoragePort,
  accountId: string,
  now = new Date(),
): void {
  const repository = createTransactionImportSessionEntityRepository(storage);
  const current = repository.get(accountId);
  if (!current || current.metadata.tombstone !== null) return;
  repository.save(Object.freeze({
    metadata: Object.freeze({ ...current.metadata, tombstone: importSessionTimestamp(now) }),
    fields: current.fields,
  }));
}
