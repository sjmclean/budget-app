import {
  createEntityRepository,
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  compareHybridTimestamps,
  mergeLwwRegisters,
  type EntityRecordStorage,
  type HybridTimestamp,
  type ReplicatedEntity,
} from "../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort.js";
import type { BudgetCategoryGroupView, BudgetCategoryView, BudgetMonthView, OverspendingHandling } from "./budgetViewTypes.js";

export const CATEGORY_GROUP_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/category-group-index";
export const CATEGORY_GROUP_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/category-group/";
export const CATEGORY_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/category-index";
export const CATEGORY_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/category/";

export type CategoryGroupEntityFields = {
  name: string;
  note: string;
  sortOrder: number;
};

export type CategoryEntityFields = {
  groupId: string;
  name: string;
  sourceCategoryId: string | null;
  isArchived: boolean;
  overspendingHandling: OverspendingHandling;
  note: string;
  sortOrder: number;
};

const validGroupFields = (fields: Readonly<Record<string, unknown>>): fields is CategoryGroupEntityFields =>
  typeof fields.name === "string" && typeof fields.note === "string" &&
  typeof fields.sortOrder === "number" && Number.isFinite(fields.sortOrder);

const validCategoryFields = (fields: Readonly<Record<string, unknown>>): fields is CategoryEntityFields =>
  typeof fields.groupId === "string" && typeof fields.name === "string" &&
  (fields.sourceCategoryId === null || typeof fields.sourceCategoryId === "string") &&
  typeof fields.isArchived === "boolean" &&
  (fields.overspendingHandling === "reduce-next-month" || fields.overspendingHandling === "carry-category") &&
  typeof fields.note === "string" && typeof fields.sortOrder === "number" && Number.isFinite(fields.sortOrder);

function createIndexedRepository<T extends Readonly<Record<string, unknown>>>(input: {
  entityType: string;
  indexKey: string;
  storage: KeyValueStoragePort;
  validFields(fields: Readonly<Record<string, unknown>>): fields is T;
}) {
  const adapter: EntityRecordStorage = {
    getItem: (key) => input.storage.getItem(key),
    setItem: (key, value) => input.storage.setItem(key, value),
    removeItem: (key) => input.storage.removeItem(key),
    listKeys: () => input.storage.listKeys?.() ?? [],
    flush: input.storage.flush ? () => input.storage.flush!() : undefined,
  };
  const base = createEntityRepository<T>({
    entityType: input.entityType,
    storage: adapter,
    codec: createJsonReplicatedEntityCodec<T>(input.validFields),
  });
  const readIds = (): string[] => {
    try {
      const parsed = JSON.parse(input.storage.getItem(input.indexKey) ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string").sort()
        : [];
    } catch {
      return [];
    }
  };
  const writeIds = (ids: readonly string[]) =>
    input.storage.setItem(input.indexKey, JSON.stringify([...new Set(ids)].sort()));

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
    flush: () => base.flush(),
  });
}

export const createCategoryGroupEntityRepository = (storage: KeyValueStoragePort) =>
  createIndexedRepository({ entityType: "category-group", indexKey: CATEGORY_GROUP_ENTITY_INDEX_KEY, storage, validFields: validGroupFields });

export const createCategoryEntityRepository = (storage: KeyValueStoragePort) =>
  createIndexedRepository({ entityType: "category", indexKey: CATEGORY_ENTITY_INDEX_KEY, storage, validFields: validCategoryFields });

export const categoryTimestampFor = (now: Date, counter = 0): HybridTimestamp =>
  createHybridTimestamp(now.getTime(), counter, "category-service");

function createEntity<T extends Readonly<Record<string, unknown>>>(id: string, fields: T, timestamp: HybridTimestamp): ReplicatedEntity<T> {
  return Object.freeze({
    metadata: Object.freeze({ id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, createLwwRegister(value, timestamp)])) as any),
  });
}

function updateEntity<T extends Readonly<Record<string, unknown>>>(
  existing: ReplicatedEntity<T> | null,
  id: string,
  fields: T,
  timestamp: HybridTimestamp,
): ReplicatedEntity<T> {
  if (!existing) return createEntity(id, fields, timestamp);
  const nextFields: Record<string, unknown> = { ...existing.fields };
  for (const [key, value] of Object.entries(fields)) {
    const current = (existing.fields as any)[key];
    if (!current || JSON.stringify(current.value) !== JSON.stringify(value)) {
      nextFields[key] = createLwwRegister(value, timestamp);
    }
  }
  return Object.freeze({ metadata: Object.freeze({ ...existing.metadata, tombstone: null }), fields: Object.freeze(nextFields) }) as ReplicatedEntity<T>;
}

function tombstone<T extends Readonly<Record<string, unknown>>>(entity: ReplicatedEntity<T>, timestamp: HybridTimestamp): ReplicatedEntity<T> {
  return Object.freeze({ metadata: Object.freeze({ ...entity.metadata, tombstone: timestamp }), fields: entity.fields });
}

export function syncCategoryEntities(storage: KeyValueStoragePort, view: BudgetMonthView, now = new Date()): void {
  const groupRepository = createCategoryGroupEntityRepository(storage);
  const categoryRepository = createCategoryEntityRepository(storage);
  const activeGroupIds = new Set<string>();
  const activeCategoryIds = new Set<string>();
  let counter = 0;

  view.categoryGroups.forEach((group, groupIndex) => {
    activeGroupIds.add(group.id);
    const timestamp = categoryTimestampFor(now, counter++);
    groupRepository.save(updateEntity(groupRepository.get(group.id), group.id, {
      name: group.name,
      note: group.note ?? "",
      sortOrder: groupIndex,
    }, timestamp));

    group.categories.forEach((category, categoryIndex) => {
      activeCategoryIds.add(category.id);
      const categoryTimestamp = categoryTimestampFor(now, counter++);
      categoryRepository.save(updateEntity(categoryRepository.get(category.id), category.id, {
        groupId: group.id,
        name: category.name,
        sourceCategoryId: category.sourceCategoryId ?? null,
        isArchived: category.isArchived === true,
        overspendingHandling: category.overspendingHandling ?? "reduce-next-month",
        note: category.note ?? "",
        sortOrder: categoryIndex,
      }, categoryTimestamp));
    });
  });

  for (const entity of groupRepository.list({ includeTombstoned: true })) {
    if (!activeGroupIds.has(entity.metadata.id) && entity.metadata.tombstone === null) {
      groupRepository.save(tombstone(entity, categoryTimestampFor(now, counter++)));
    }
  }
  for (const entity of categoryRepository.list({ includeTombstoned: true })) {
    if (!activeCategoryIds.has(entity.metadata.id) && entity.metadata.tombstone === null) {
      categoryRepository.save(tombstone(entity, categoryTimestampFor(now, counter++)));
    }
  }
}

function projectGroup(entity: ReplicatedEntity<CategoryGroupEntityFields>): Pick<BudgetCategoryGroupView, "id" | "name" | "note"> & { sortOrder: number } {
  return { id: entity.metadata.id, name: entity.fields.name.value, note: entity.fields.note.value, sortOrder: entity.fields.sortOrder.value };
}
function projectCategory(entity: ReplicatedEntity<CategoryEntityFields>): Pick<BudgetCategoryView, "id" | "name" | "sourceCategoryId" | "isArchived" | "overspendingHandling" | "note"> & { groupId: string; sortOrder: number } {
  return {
    id: entity.metadata.id,
    groupId: entity.fields.groupId.value,
    name: entity.fields.name.value,
    sourceCategoryId: entity.fields.sourceCategoryId.value ?? undefined,
    isArchived: entity.fields.isArchived.value,
    overspendingHandling: entity.fields.overspendingHandling.value,
    note: entity.fields.note.value,
    sortOrder: entity.fields.sortOrder.value,
  };
}

export function applyCategoryEntities(storage: KeyValueStoragePort, view: BudgetMonthView): BudgetMonthView {
  const groups = createCategoryGroupEntityRepository(storage).list().map(projectGroup).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const categories = createCategoryEntityRepository(storage).list().map(projectCategory);
  if (groups.length === 0) return view;

  const oldGroups = new Map(view.categoryGroups.map((group) => [group.id, group] as const));
  const oldCategories = new Map(view.categoryGroups.flatMap((group) => group.categories.map((category) => [category.id, category] as const)));
  return {
    ...view,
    categoryGroups: groups.map((group) => {
      const oldGroup = oldGroups.get(group.id);
      const groupCategories = categories
        .filter((category) => category.groupId === group.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return {
        id: group.id,
        name: group.name,
        note: group.note,
        previousAvailable: oldGroup?.previousAvailable ?? 0,
        assigned: oldGroup?.assigned ?? 0,
        activity: oldGroup?.activity ?? 0,
        available: oldGroup?.available ?? 0,
        categories: groupCategories.map((category) => {
          const old = oldCategories.get(category.id);
          return {
            id: category.id,
            name: category.name,
            sourceCategoryId: category.sourceCategoryId,
            previousAvailable: old?.previousAvailable ?? 0,
            assigned: old?.assigned ?? 0,
            activity: old?.activity ?? 0,
            available: old?.available ?? 0,
            isOverspent: old?.isOverspent ?? false,
            isArchived: category.isArchived,
            overspendingHandling: category.overspendingHandling,
            note: category.note,
          };
        }),
      };
    }),
  };
}

export function mergeCategoryEntities<T extends CategoryGroupEntityFields | CategoryEntityFields>(
  left: ReplicatedEntity<T>, right: ReplicatedEntity<T>,
): ReplicatedEntity<T> {
  if (left.metadata.id !== right.metadata.id) throw new TypeError("Cannot merge different category entities.");
  const tombstoneValue = !left.metadata.tombstone ? right.metadata.tombstone : !right.metadata.tombstone ? left.metadata.tombstone :
    compareHybridTimestamps(left.metadata.tombstone, right.metadata.tombstone) >= 0 ? left.metadata.tombstone : right.metadata.tombstone;
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(left.fields)) fields[key] = mergeLwwRegisters((left.fields as any)[key], (right.fields as any)[key]);
  return Object.freeze({ metadata: Object.freeze({ ...left.metadata, tombstone: tombstoneValue }), fields: Object.freeze(fields) }) as ReplicatedEntity<T>;
}
