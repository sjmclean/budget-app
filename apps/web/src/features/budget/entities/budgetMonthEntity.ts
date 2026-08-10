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
import type { BudgetMonthView } from "../budgetViewTypes.js";

export const BUDGET_MONTH_ENTITY_INDEX_KEY =
  "budget-app.entity-replication.v1/budget-month-index";
export const BUDGET_MONTH_ENTITY_RECORD_PREFIX =
  "budget-app.entity-replication.v1/budget-month/";

export interface BudgetMonthEntityValue {
  budgetId: string;
  month: string;
  view: BudgetMonthView;
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBudgetMonthEntityValue(fields: Readonly<Record<string, unknown>>): fields is BudgetMonthEntityValue & Readonly<Record<string, unknown>> {
  return typeof fields.budgetId === "string" && typeof fields.month === "string" && isRecord(fields.view) && fields.view.budgetId === fields.budgetId;
}

export function getBudgetMonthEntityId(budgetId: string, month: string): string {
  return `${budgetId}:${month}`;
}

function readIds(storage: KeyValueStoragePort): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(BUDGET_MONTH_ENTITY_INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0))].sort() : [];
  } catch {
    return [];
  }
}

function writeIds(storage: KeyValueStoragePort, ids: readonly string[]): void {
  storage.setItem(BUDGET_MONTH_ENTITY_INDEX_KEY, JSON.stringify([...new Set(ids)].sort()));
}

export function createBudgetMonthEntityRepository(storage: KeyValueStoragePort) {
  const base = createEntityRepository<BudgetMonthEntityValue>({
    entityType: "budget-month",
    storage: storageAdapter(storage),
    codec: createJsonReplicatedEntityCodec<BudgetMonthEntityValue>(isBudgetMonthEntityValue),
  });
  return Object.freeze({
    get: (id: string) => base.get(id),
    save(entity: ReplicatedEntity<BudgetMonthEntityValue>) {
      base.save(entity);
      writeIds(storage, [...readIds(storage), entity.metadata.id]);
    },
    list(options: { includeTombstoned?: boolean } = {}) {
      return readIds(storage)
        .map((id) => base.get(id))
        .filter((entity): entity is ReplicatedEntity<BudgetMonthEntityValue> => entity !== null)
        .filter((entity) => options.includeTombstoned || entity.metadata.tombstone === null);
    },
  });
}

function entityTimestamp(now = new Date(), counter = 0): HybridTimestamp {
  return createHybridTimestamp(now.getTime(), counter, "budget-view-service");
}

export function projectBudgetMonthEntity(entity: ReplicatedEntity<BudgetMonthEntityValue>): BudgetMonthEntityValue {
  return Object.fromEntries(Object.entries(entity.fields).map(([key, register]) => [key, register.value])) as unknown as BudgetMonthEntityValue;
}

export function readBudgetMonthEntity(storage: KeyValueStoragePort, budgetId: string, month: string): BudgetMonthView | null {
  const entity = createBudgetMonthEntityRepository(storage).get(getBudgetMonthEntityId(budgetId, month));
  return entity && entity.metadata.tombstone === null ? projectBudgetMonthEntity(entity).view : null;
}

export function writeBudgetMonthEntity(storage: KeyValueStoragePort, budgetId: string, month: string, view: BudgetMonthView, now = new Date()): void {
  const repository = createBudgetMonthEntityRepository(storage);
  const id = getBudgetMonthEntityId(budgetId, month);
  const current = repository.get(id);
  const ts = entityTimestamp(now);
  repository.save(Object.freeze({
    metadata: Object.freeze(current ? { ...current.metadata, tombstone: null } : { id, createdAt: ts, tombstone: null }),
    fields: Object.freeze({
      budgetId: current?.fields.budgetId ?? createLwwRegister(budgetId, ts),
      month: current?.fields.month ?? createLwwRegister(month, ts),
      view: current && JSON.stringify(current.fields.view.value) === JSON.stringify(view) ? current.fields.view : createLwwRegister(view, ts),
    }),
  }));
}

export function tombstoneBudgetMonthEntity(storage: KeyValueStoragePort, budgetId: string, month: string, now = new Date()): void {
  const repository = createBudgetMonthEntityRepository(storage);
  const current = repository.get(getBudgetMonthEntityId(budgetId, month));
  if (!current || current.metadata.tombstone !== null) return;
  repository.save(Object.freeze({ metadata: Object.freeze({ ...current.metadata, tombstone: entityTimestamp(now) }), fields: current.fields }));
}

export function listBudgetMonthEntities(storage: KeyValueStoragePort, budgetId?: string): Array<BudgetMonthEntityValue> {
  return createBudgetMonthEntityRepository(storage)
    .list()
    .map(projectBudgetMonthEntity)
    .filter((value) => budgetId === undefined || value.budgetId === budgetId)
    .sort((left, right) => left.month.localeCompare(right.month));
}

export function purgeBudgetMonthEntities(storage: KeyValueStoragePort, budgetId: string): number {
  const ids = readIds(storage);
  const matchingIds = ids.filter((id) => {
    const entity = createBudgetMonthEntityRepository(storage).get(id);
    return entity !== null && projectBudgetMonthEntity(entity).budgetId === budgetId;
  });
  for (const id of matchingIds) {
    storage.removeItem(`${BUDGET_MONTH_ENTITY_RECORD_PREFIX}${encodeURIComponent(id)}`);
  }
  writeIds(storage, ids.filter((id) => !matchingIds.includes(id)));
  return matchingIds.length;
}
