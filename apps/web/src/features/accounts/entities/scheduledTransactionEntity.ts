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
} from "../../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import type { ScheduledTransactionView } from "../scheduledTransactionTypes.js";

export const SCHEDULED_TRANSACTION_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/scheduled-transaction-index";
export const SCHEDULED_TRANSACTION_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/scheduled-transaction/";

export type ScheduledTransactionEntityFields = Omit<ScheduledTransactionView, "id" | "endDate" | "occurrenceCount" | "payeeId" | "categoryId" | "splitLines" | "specificDates" | "specificDateIndex" | "specificInstalments"> & {
  endDate: string | null;
  occurrenceCount: number | null;
  payeeId: string | null;
  categoryId: string | null;
  splitLines: ScheduledTransactionView["splitLines"] | null;
  specificDates: string[] | null;
  specificDateIndex: number | null;
  specificInstalments: NonNullable<ScheduledTransactionView["specificInstalments"]> | null;
};

function validFields(fields: Readonly<Record<string, unknown>>): fields is ScheduledTransactionEntityFields {
  return typeof fields.accountId === "string" && Array.isArray(fields.tagIds) &&
    typeof fields.nextDueDate === "string" && typeof fields.frequency === "string" &&
    (fields.recurrenceKind === undefined || fields.recurrenceKind === "rule" || fields.recurrenceKind === "specific-dates") &&
    (fields.specificDates === null || Array.isArray(fields.specificDates)) &&
    (fields.specificDateIndex === null || typeof fields.specificDateIndex === "number") &&
    (fields.specificInstalments === null || Array.isArray(fields.specificInstalments)) &&
    (fields.attachments === undefined || Array.isArray(fields.attachments)) &&
    typeof fields.recurrenceInterval === "number" && typeof fields.recurrenceUnit === "string" &&
    typeof fields.recurrenceAnchorDate === "string" && typeof fields.endCondition === "string" &&
    (fields.recurrenceAnchorDay === undefined || typeof fields.recurrenceAnchorDay === "number") &&
    (fields.monthDayPolicy === undefined || typeof fields.monthDayPolicy === "string") &&
    (fields.endDate === null || typeof fields.endDate === "string") &&
    (fields.occurrenceCount === null || typeof fields.occurrenceCount === "number") &&
    typeof fields.occurrencesCompleted === "number" && typeof fields.weekendPolicy === "string" &&
    typeof fields.payee === "string" && (fields.payeeId === null || typeof fields.payeeId === "string") &&
    typeof fields.category === "string" && (fields.categoryId === null || typeof fields.categoryId === "string") &&
    typeof fields.memo === "string" && typeof fields.outflow === "number" && typeof fields.inflow === "number" &&
    (fields.splitLines === null || Array.isArray(fields.splitLines)) &&
    typeof fields.createdAt === "string" && typeof fields.updatedAt === "string";
}

export function createScheduledTransactionEntityRepository(storage: KeyValueStoragePort) {
  const adapter: EntityRecordStorage = {
    getItem: (key) => storage.getItem(key), setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key), listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
  const base = createEntityRepository<ScheduledTransactionEntityFields>({
    entityType: "scheduled-transaction", storage: adapter,
    codec: createJsonReplicatedEntityCodec<ScheduledTransactionEntityFields>(validFields),
  });
  const readIds = (): string[] => {
    try { const parsed = JSON.parse(storage.getItem(SCHEDULED_TRANSACTION_ENTITY_INDEX_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").sort() : [];
    } catch { return []; }
  };
  const writeIds = (ids: readonly string[]) => storage.setItem(SCHEDULED_TRANSACTION_ENTITY_INDEX_KEY, JSON.stringify([...new Set(ids)].sort()));
  return Object.freeze({
    get: (id: string) => base.get(id),
    save(entity: ReplicatedEntity<ScheduledTransactionEntityFields>) { base.save(entity); writeIds([...readIds(), entity.metadata.id]); },
    list(options: { includeTombstoned?: boolean } = {}) { return readIds().map((id) => base.get(id)).filter((e): e is ReplicatedEntity<ScheduledTransactionEntityFields> => e !== null).filter((e) => options.includeTombstoned || e.metadata.tombstone === null); },
    purge(id: string) { base.purge(id); writeIds(readIds().filter((candidate) => candidate !== id)); },
    flush: () => base.flush(),
  });
}

export const scheduledTransactionTimestampFor = (now: Date, counter = 0): HybridTimestamp =>
  createHybridTimestamp(now.getTime(), counter, "scheduled-transaction-service");

function entityValues(transaction: ScheduledTransactionView): ScheduledTransactionEntityFields {
  const { id: _id, ...source } = transaction;
  return {
    ...source, tagIds: [...(source.tagIds ?? [])], memo: source.memo ?? "",
    recurrenceInterval: source.recurrenceInterval ?? 1,
    recurrenceUnit: source.recurrenceUnit ?? (source.frequency === "yearly" ? "year" : source.frequency === "weekly" || source.frequency === "fortnightly" ? "week" : source.frequency === "daily" ? "day" : "month"),
    recurrenceAnchorDate: source.recurrenceAnchorDate ?? source.nextDueDate,
    recurrenceAnchorDay: source.recurrenceAnchorDay ?? Number.parseInt((source.recurrenceAnchorDate ?? source.nextDueDate).slice(8, 10), 10),
    monthDayPolicy: source.monthDayPolicy ?? "same-day-number",
    endCondition: source.endCondition ?? "never", occurrencesCompleted: source.occurrencesCompleted ?? 0,
    weekendPolicy: source.weekendPolicy ?? "same-day", endDate: source.endDate ?? null,
    occurrenceCount: source.occurrenceCount ?? null, payeeId: source.payeeId ?? null,
    categoryId: source.categoryId ?? null, splitLines: source.splitLines ?? null,
    specificDates: source.specificDates ? [...source.specificDates] : null,
    specificDateIndex: source.specificDateIndex ?? null,
    specificInstalments: source.specificInstalments?.map((instalment) => ({ ...instalment })) ?? null,
    attachments: (source.attachments ?? []).map((attachment) => ({ ...attachment })),
  };
}

export function createScheduledTransactionEntity(transaction: ScheduledTransactionView, timestamp: HybridTimestamp): ReplicatedEntity<ScheduledTransactionEntityFields> {
  const values = entityValues(transaction);
  return Object.freeze({
    metadata: Object.freeze({ id: transaction.id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, createLwwRegister(value, timestamp)])) as any),
  });
}

export function updateScheduledTransactionEntity(
  existing: ReplicatedEntity<ScheduledTransactionEntityFields>,
  transaction: ScheduledTransactionView,
  timestamp: HybridTimestamp,
): ReplicatedEntity<ScheduledTransactionEntityFields> {
  const values = entityValues(transaction);
  const fields: Record<string, unknown> = { ...existing.fields };
  for (const [key, value] of Object.entries(values)) {
    const current = (existing.fields as any)[key];
    if (!current || JSON.stringify(current.value) !== JSON.stringify(value)) fields[key] = createLwwRegister(value, timestamp);
  }
  return Object.freeze({ metadata: Object.freeze({ ...existing.metadata, tombstone: null }), fields: Object.freeze(fields) }) as ReplicatedEntity<ScheduledTransactionEntityFields>;
}

export function projectScheduledTransaction(entity: ReplicatedEntity<ScheduledTransactionEntityFields>): ScheduledTransactionView {
  const values = Object.fromEntries(Object.entries(entity.fields).map(([key, register]) => [key, register.value])) as ScheduledTransactionEntityFields;
  const recurrenceAnchorDate = values.recurrenceAnchorDate ?? values.nextDueDate;
  return {
    ...values, id: entity.metadata.id,
    recurrenceAnchorDay: values.recurrenceAnchorDay ?? Number.parseInt(recurrenceAnchorDate.slice(8, 10), 10),
    monthDayPolicy: values.monthDayPolicy ?? "same-day-number",
    endDate: values.endDate ?? undefined, occurrenceCount: values.occurrenceCount ?? undefined,
    payeeId: values.payeeId ?? undefined, categoryId: values.categoryId ?? undefined, splitLines: values.splitLines ?? undefined,
    specificDates: values.specificDates ?? undefined, specificDateIndex: values.specificDateIndex ?? undefined,
    specificInstalments: values.specificInstalments ?? undefined,
  };
}

export function mergeScheduledTransactionEntities(left: ReplicatedEntity<ScheduledTransactionEntityFields>, right: ReplicatedEntity<ScheduledTransactionEntityFields>): ReplicatedEntity<ScheduledTransactionEntityFields> {
  if (left.metadata.id !== right.metadata.id) throw new TypeError("Cannot merge different scheduled transactions.");
  const tombstone = !left.metadata.tombstone ? right.metadata.tombstone : !right.metadata.tombstone ? left.metadata.tombstone :
    compareHybridTimestamps(left.metadata.tombstone, right.metadata.tombstone) >= 0 ? left.metadata.tombstone : right.metadata.tombstone;
  const fields: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(left.fields), ...Object.keys(right.fields)])) {
    const leftRegister = (left.fields as any)[key];
    const rightRegister = (right.fields as any)[key];
    fields[key] = !leftRegister
      ? rightRegister
      : !rightRegister
        ? leftRegister
        : mergeLwwRegisters(leftRegister, rightRegister);
  }
  return Object.freeze({ metadata: Object.freeze({ ...left.metadata, tombstone }), fields: Object.freeze(fields) }) as ReplicatedEntity<ScheduledTransactionEntityFields>;
}

export function replaceScheduledTransactionEntities(storage: KeyValueStoragePort, transactions: readonly ScheduledTransactionView[], now = new Date()): void {
  const repository = createScheduledTransactionEntityRepository(storage);
  const activeIds = new Set(transactions.map((transaction) => transaction.id));
  let counter = 0;
  for (const transaction of transactions) {
    const timestamp = scheduledTransactionTimestampFor(now, counter++);
    const existing = repository.get(transaction.id);
    repository.save(existing ? updateScheduledTransactionEntity(existing, transaction, timestamp) : createScheduledTransactionEntity(transaction, timestamp));
  }
  for (const entity of repository.list({ includeTombstoned: true })) {
    if (!activeIds.has(entity.metadata.id) && entity.metadata.tombstone === null) {
      repository.save(Object.freeze({ metadata: Object.freeze({ ...entity.metadata, tombstone: scheduledTransactionTimestampFor(now, counter++) }), fields: entity.fields }));
    }
  }
}
