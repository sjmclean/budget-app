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

export const TABLE_LAYOUT_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/table-layout-index";
export const TABLE_LAYOUT_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/table-layout/";

export interface TableLayoutPreferenceEntityValue {
  layoutId: string;
  visibleColumnIds: string[];
  columnWidths: Record<string, number>;
}

function storageAdapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
}

function isValue(fields: Readonly<Record<string, unknown>>): fields is TableLayoutPreferenceEntityValue & Readonly<Record<string, unknown>> {
  return typeof fields.layoutId === "string" &&
    Array.isArray(fields.visibleColumnIds) &&
    fields.visibleColumnIds.every((value) => typeof value === "string") &&
    typeof fields.columnWidths === "object" && fields.columnWidths !== null && !Array.isArray(fields.columnWidths) &&
    Object.values(fields.columnWidths).every((value) => typeof value === "number" && Number.isFinite(value));
}

function readIds(storage: KeyValueStoragePort): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(TABLE_LAYOUT_ENTITY_INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0))].sort() : [];
  } catch {
    return [];
  }
}

function writeIds(storage: KeyValueStoragePort, ids: readonly string[]): void {
  storage.setItem(TABLE_LAYOUT_ENTITY_INDEX_KEY, JSON.stringify([...new Set(ids)].sort()));
}

export function createTableLayoutEntityRepository(storage: KeyValueStoragePort) {
  const base = createEntityRepository<TableLayoutPreferenceEntityValue>({
    entityType: "table-layout",
    storage: storageAdapter(storage),
    codec: createJsonReplicatedEntityCodec<TableLayoutPreferenceEntityValue>(isValue),
  });
  return Object.freeze({
    get: (id: string) => base.get(id),
    save(entity: ReplicatedEntity<TableLayoutPreferenceEntityValue>) {
      base.save(entity);
      writeIds(storage, [...readIds(storage), entity.metadata.id]);
    },
  });
}

function timestamp(now = new Date(), counter = 0): HybridTimestamp {
  return createHybridTimestamp(now.getTime(), counter, "table-layout-service");
}

function project(entity: ReplicatedEntity<TableLayoutPreferenceEntityValue>): TableLayoutPreferenceEntityValue {
  return Object.fromEntries(Object.entries(entity.fields).map(([key, register]) => [key, register.value])) as unknown as TableLayoutPreferenceEntityValue;
}

export function readTableLayoutPreferenceEntity(storage: KeyValueStoragePort, layoutId: string): TableLayoutPreferenceEntityValue | null {
  const entity = createTableLayoutEntityRepository(storage).get(layoutId);
  return entity && entity.metadata.tombstone === null ? project(entity) : null;
}

export function writeTableLayoutPreferenceEntity(storage: KeyValueStoragePort, value: TableLayoutPreferenceEntityValue, now = new Date()): void {
  const repository = createTableLayoutEntityRepository(storage);
  const current = repository.get(value.layoutId);
  const ts = timestamp(now);
  repository.save(Object.freeze({
    metadata: Object.freeze(current ? { ...current.metadata, tombstone: null } : { id: value.layoutId, createdAt: ts, tombstone: null }),
    fields: Object.freeze({
      layoutId: current?.fields.layoutId ?? createLwwRegister(value.layoutId, ts),
      visibleColumnIds: current && JSON.stringify(current.fields.visibleColumnIds.value) === JSON.stringify(value.visibleColumnIds)
        ? current.fields.visibleColumnIds : createLwwRegister(value.visibleColumnIds, ts),
      columnWidths: current && JSON.stringify(current.fields.columnWidths.value) === JSON.stringify(value.columnWidths)
        ? current.fields.columnWidths : createLwwRegister(value.columnWidths, ts),
    }),
  }));
}

export function tombstoneTableLayoutPreferenceEntity(storage: KeyValueStoragePort, layoutId: string, now = new Date()): void {
  const repository = createTableLayoutEntityRepository(storage);
  const current = repository.get(layoutId);
  if (!current || current.metadata.tombstone !== null) return;
  repository.save(Object.freeze({ metadata: Object.freeze({ ...current.metadata, tombstone: timestamp(now) }), fields: current.fields }));
}
