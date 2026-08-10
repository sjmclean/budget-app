import {
  compareHybridTimestamps,
  createEntityRepository,
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  mergeLwwRegisters,
  type EntityRecordStorage,
  type HybridTimestamp,
  type ReplicatedEntity,
} from "../../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import { isTransactionTagIcon } from "../transactionTagIconTypes.js";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "../transactionTagTypes.js";

export const TRANSACTION_TAG_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/transaction-tag-index";
export const TRANSACTION_TAG_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/transaction-tag/";

const TRANSACTION_TAG_COLOURS = new Set<TransactionTagColour>([
  "red", "rose", "gray", "orange", "amber", "yellow", "lime", "green",
  "emerald", "teal", "cyan", "sky", "blue", "navy", "indigo", "violet",
  "purple", "fuchsia", "pink", "brown", "sand", "slate", "black",
]);

export interface TransactionTagEntityFields {
  name: string;
  description: string | null;
  colour: TransactionTagColour;
  icon: TransactionTagDefinition["icon"] | null;
  autoTagImportedTransactions: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
}

function validFields(
  fields: Readonly<Record<string, unknown>>,
): fields is TransactionTagEntityFields & Readonly<Record<string, unknown>> {
  return typeof fields.name === "string" && fields.name.length > 0 &&
    (fields.description === null || typeof fields.description === "string") &&
    typeof fields.colour === "string" &&
    TRANSACTION_TAG_COLOURS.has(fields.colour as TransactionTagColour) &&
    (fields.icon === null || isTransactionTagIcon(fields.icon)) &&
    typeof fields.autoTagImportedTransactions === "boolean" &&
    typeof fields.archived === "boolean" &&
    typeof fields.createdAt === "string" && fields.createdAt.length > 0 &&
    typeof fields.updatedAt === "string" && fields.updatedAt.length > 0 &&
    typeof fields.sortOrder === "number" && Number.isFinite(fields.sortOrder);
}

export const transactionTagEntityCodec =
  createJsonReplicatedEntityCodec<TransactionTagEntityFields>(validFields);

function adapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
}

export function createTransactionTagEntityRepository(storage: KeyValueStoragePort) {
  const base = createEntityRepository<TransactionTagEntityFields>({
    entityType: "transaction-tag",
    storage: adapter(storage),
    codec: transactionTagEntityCodec,
  });
  const readIds = (): string[] => {
    try {
      const parsed = JSON.parse(storage.getItem(TRANSACTION_TAG_ENTITY_INDEX_KEY) ?? "[]");
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))].sort()
        : [];
    } catch {
      return [];
    }
  };
  const writeIds = (ids: readonly string[]) =>
    storage.setItem(TRANSACTION_TAG_ENTITY_INDEX_KEY, JSON.stringify([...new Set(ids)].sort()));

  return Object.freeze({
    get: (id: string) => base.get(id),
    has: (id: string) => base.has(id),
    save(entity: ReplicatedEntity<TransactionTagEntityFields>) {
      base.save(entity);
      writeIds([...readIds(), entity.metadata.id]);
    },
    list(options: { includeTombstoned?: boolean } = {}) {
      return readIds()
        .map((id) => base.get(id))
        .filter((entity): entity is ReplicatedEntity<TransactionTagEntityFields> => entity !== null)
        .filter((entity) => options.includeTombstoned || entity.metadata.tombstone === null);
    },
    purge(id: string) {
      base.purge(id);
      writeIds(readIds().filter((candidate) => candidate !== id));
    },
    flush: () => base.flush(),
  });
}

export const transactionTagTimestampFor = (now: Date, counter = 0): HybridTimestamp =>
  createHybridTimestamp(now.getTime(), counter, "transaction-tag-service");

function values(tag: TransactionTagDefinition, sortOrder: number): TransactionTagEntityFields {
  return {
    name: tag.name,
    description: tag.description ?? null,
    colour: tag.colour,
    icon: tag.icon ?? null,
    autoTagImportedTransactions: tag.autoTagImportedTransactions,
    archived: tag.archived,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
    sortOrder,
  };
}

export function createTransactionTagEntity(
  tag: TransactionTagDefinition,
  sortOrder: number,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionTagEntityFields> {
  return Object.freeze({
    metadata: Object.freeze({ id: tag.id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(Object.fromEntries(
      Object.entries(values(tag, sortOrder)).map(([key, value]) => [key, createLwwRegister(value, timestamp)]),
    )) as ReplicatedEntity<TransactionTagEntityFields>["fields"],
  });
}

export function updateTransactionTagEntity(
  entity: ReplicatedEntity<TransactionTagEntityFields>,
  tag: TransactionTagDefinition,
  sortOrder: number,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionTagEntityFields> {
  const nextValues = values(tag, sortOrder);
  const nextFields = Object.fromEntries(Object.entries(nextValues).map(([key, value]) => {
    const current = entity.fields[key as keyof TransactionTagEntityFields];
    return [key, Object.is(current.value, value) ? current : createLwwRegister(value, timestamp)];
  })) as ReplicatedEntity<TransactionTagEntityFields>["fields"];
  return Object.freeze({ metadata: entity.metadata, fields: Object.freeze(nextFields) });
}

export function tombstoneTransactionTagEntity(
  entity: ReplicatedEntity<TransactionTagEntityFields>,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionTagEntityFields> {
  return Object.freeze({
    metadata: Object.freeze({ ...entity.metadata, tombstone: timestamp }),
    fields: entity.fields,
  });
}

export function projectTransactionTagEntity(
  entity: ReplicatedEntity<TransactionTagEntityFields>,
): TransactionTagDefinition {
  return {
    id: entity.metadata.id,
    name: entity.fields.name.value,
    ...(entity.fields.description.value ? { description: entity.fields.description.value } : {}),
    colour: entity.fields.colour.value,
    ...(entity.fields.icon.value ? { icon: entity.fields.icon.value } : {}),
    autoTagImportedTransactions: entity.fields.autoTagImportedTransactions.value,
    archived: entity.fields.archived.value,
    createdAt: entity.fields.createdAt.value,
    updatedAt: entity.fields.updatedAt.value,
  };
}

export function listProjectedTransactionTags(storage: KeyValueStoragePort): TransactionTagDefinition[] {
  return createTransactionTagEntityRepository(storage)
    .list()
    .sort((a, b) => a.fields.sortOrder.value - b.fields.sortOrder.value || a.metadata.id.localeCompare(b.metadata.id))
    .map(projectTransactionTagEntity);
}

export function syncTransactionTagEntities(
  storage: KeyValueStoragePort,
  tags: readonly TransactionTagDefinition[],
  now = new Date(),
): void {
  const repository = createTransactionTagEntityRepository(storage);
  const existing = new Map(repository.list({ includeTombstoned: true }).map((entity) => [entity.metadata.id, entity]));
  const retained = new Set<string>();
  let counter = 0;
  tags.forEach((tag, sortOrder) => {
    retained.add(tag.id);
    const timestamp = transactionTagTimestampFor(now, counter++);
    const current = existing.get(tag.id);
    repository.save(current
      ? updateTransactionTagEntity(current, tag, sortOrder, timestamp)
      : createTransactionTagEntity(tag, sortOrder, timestamp));
  });
  for (const entity of existing.values()) {
    if (!retained.has(entity.metadata.id) && entity.metadata.tombstone === null) {
      repository.save(tombstoneTransactionTagEntity(entity, transactionTagTimestampFor(now, counter++)));
    }
  }
}

export function replaceTransactionTagEntities(
  storage: KeyValueStoragePort,
  tags: readonly TransactionTagDefinition[],
  now = new Date(),
): void {
  const repository = createTransactionTagEntityRepository(storage);
  for (const entity of repository.list({ includeTombstoned: true })) repository.purge(entity.metadata.id);
  tags.forEach((tag, index) => repository.save(createTransactionTagEntity(tag, index, transactionTagTimestampFor(now, index))));
}

export function mergeTransactionTagEntities(
  left: ReplicatedEntity<TransactionTagEntityFields>,
  right: ReplicatedEntity<TransactionTagEntityFields>,
): ReplicatedEntity<TransactionTagEntityFields> {
  if (left.metadata.id !== right.metadata.id) throw new TypeError("Cannot merge different transaction tags.");
  const tombstone = !left.metadata.tombstone ? right.metadata.tombstone
    : !right.metadata.tombstone ? left.metadata.tombstone
      : compareHybridTimestamps(left.metadata.tombstone, right.metadata.tombstone) >= 0
        ? left.metadata.tombstone : right.metadata.tombstone;
  const fieldEntries = (Object.keys(left.fields) as Array<keyof TransactionTagEntityFields>).map(
    <K extends keyof TransactionTagEntityFields>(key: K) => [
      key,
      mergeLwwRegisters(left.fields[key], right.fields[key]),
    ] as const,
  );
  const fields = Object.fromEntries(fieldEntries) as unknown as ReplicatedEntity<TransactionTagEntityFields>["fields"];
  return Object.freeze({ metadata: Object.freeze({ ...left.metadata, tombstone }), fields: Object.freeze(fields) });
}
