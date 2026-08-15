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
import type {
  RegisterAttachmentView,
  RegisterSplitLineView,
  RegisterTransactionView,
} from "../accountRegisterTypes.js";

export const TRANSACTION_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/transaction-index";
export const TRANSACTION_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/transaction/";

export interface TransactionAttachmentEntityValue {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  attachedAt: string;
  contentDataUrl: string | null;
  contentRef: string | null;
  contentHash: string | null;
  storageType: "inline-data-url" | "browser-indexeddb" | "external-file" | "local-sqlite" | null;
}

export interface TransactionSplitLineEntityValue {
  id: string;
  category: string;
  categoryId: string | null;
  memo: string | null;
  inflow: number;
  outflow: number;
  transferId: string | null;
  transferAccountId: string | null;
  transferTransactionId: string | null;
}

export interface TransactionEntityFields {
  accountId: string;
  date: string;
  tagIds: string[];
  attachments: TransactionAttachmentEntityValue[];
  payee: string;
  /** Immutable imported/bank description; optional for pre-provenance entities. */
  rawPayee?: string | null;
  payeeId: string | null;
  category: string;
  categoryId: string | null;
  memo: string | null;
  checkNumber: string | null;
  inflow: number;
  outflow: number;
  cleared: boolean;
  reconciled: boolean;
  transferId: string | null;
  transferAccountId: string | null;
  transferTransactionId: string | null;
  splitLines: TransactionSplitLineEntityValue[];
  generatedFromSchedule: boolean;
  scheduledTransactionId: string | null;
  scheduledOccurrenceDate: string | null;
}

export type TransactionEntitySource = Omit<RegisterTransactionView, "runningBalance" | "attachmentCount"> & {
  accountId: string;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAttachment(value: unknown): value is TransactionAttachmentEntityValue {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    isFiniteNumber(value.fileSize) && value.fileSize >= 0 &&
    typeof value.mimeType === "string" &&
    typeof value.attachedAt === "string" &&
    isNullableString(value.contentDataUrl) &&
    isNullableString(value.contentRef) &&
    isNullableString(value.contentHash) &&
    (value.storageType === null ||
      value.storageType === "inline-data-url" ||
      value.storageType === "browser-indexeddb" ||
      value.storageType === "external-file" ||
      value.storageType === "local-sqlite");
}

function isSplitLine(value: unknown): value is TransactionSplitLineEntityValue {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    isNullableString(value.categoryId) &&
    isNullableString(value.memo) &&
    isFiniteNumber(value.inflow) && value.inflow >= 0 &&
    isFiniteNumber(value.outflow) && value.outflow >= 0 &&
    isNullableString(value.transferId) &&
    isNullableString(value.transferAccountId) &&
    isNullableString(value.transferTransactionId);
}

export function validTransactionEntityFields(
  fields: Readonly<Record<string, unknown>>,
): fields is TransactionEntityFields & Readonly<Record<string, unknown>> {
  return typeof fields.accountId === "string" && fields.accountId.length > 0 &&
    typeof fields.date === "string" && fields.date.length > 0 &&
    Array.isArray(fields.tagIds) && fields.tagIds.every((value) => typeof value === "string") &&
    Array.isArray(fields.attachments) && fields.attachments.every(isAttachment) &&
    typeof fields.payee === "string" &&
    (fields.rawPayee === undefined || isNullableString(fields.rawPayee)) &&
    isNullableString(fields.payeeId) &&
    typeof fields.category === "string" &&
    isNullableString(fields.categoryId) &&
    isNullableString(fields.memo) &&
    isNullableString(fields.checkNumber) &&
    isFiniteNumber(fields.inflow) && fields.inflow >= 0 &&
    isFiniteNumber(fields.outflow) && fields.outflow >= 0 &&
    typeof fields.cleared === "boolean" &&
    typeof fields.reconciled === "boolean" &&
    isNullableString(fields.transferId) &&
    isNullableString(fields.transferAccountId) &&
    isNullableString(fields.transferTransactionId) &&
    Array.isArray(fields.splitLines) && fields.splitLines.every(isSplitLine) &&
    typeof fields.generatedFromSchedule === "boolean" &&
    isNullableString(fields.scheduledTransactionId) &&
    isNullableString(fields.scheduledOccurrenceDate);
}

export const transactionEntityCodec = createJsonReplicatedEntityCodec<TransactionEntityFields>(
  validTransactionEntityFields,
);

function toAdapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
}

export function createTransactionEntityRepository(storage: KeyValueStoragePort) {
  const base = createEntityRepository<TransactionEntityFields>({
    entityType: "transaction",
    storage: toAdapter(storage),
    codec: transactionEntityCodec,
  });
  const readIds = (): string[] => {
    try {
      const parsed = JSON.parse(storage.getItem(TRANSACTION_ENTITY_INDEX_KEY) ?? "[]");
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))].sort()
        : [];
    } catch {
      return [];
    }
  };
  const writeIds = (ids: readonly string[]) => {
    storage.setItem(TRANSACTION_ENTITY_INDEX_KEY, JSON.stringify([...new Set(ids)].sort()));
  };
  return Object.freeze({
    get: (id: string) => base.get(id),
    has: (id: string) => base.has(id),
    save(entity: ReplicatedEntity<TransactionEntityFields>) {
      base.save(entity);
      writeIds([...readIds(), entity.metadata.id]);
    },
    list(options: { includeTombstoned?: boolean; accountId?: string } = {}) {
      return readIds()
        .map((id) => base.get(id))
        .filter((entity): entity is ReplicatedEntity<TransactionEntityFields> => entity !== null)
        .filter((entity) => options.includeTombstoned || entity.metadata.tombstone === null)
        .filter((entity) => !options.accountId || entity.fields.accountId.value === options.accountId);
    },
    purge(id: string) {
      base.purge(id);
      writeIds(readIds().filter((candidate) => candidate !== id));
    },
    flush: () => base.flush(),
  });
}

export const transactionTimestampFor = (now: Date, counter = 0): HybridTimestamp =>
  createHybridTimestamp(now.getTime(), counter, "transaction-service");

function normaliseAttachment(attachment: RegisterAttachmentView): TransactionAttachmentEntityValue {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    mimeType: attachment.mimeType,
    attachedAt: attachment.attachedAt,
    contentDataUrl: attachment.contentDataUrl ?? null,
    contentRef: attachment.contentRef ?? null,
    contentHash: attachment.contentHash ?? null,
    storageType: attachment.storageType ?? null,
  };
}

function normaliseSplitLine(line: RegisterSplitLineView): TransactionSplitLineEntityValue {
  return {
    id: line.id,
    category: line.category,
    categoryId: line.categoryId ?? null,
    memo: line.memo ?? null,
    inflow: line.inflow,
    outflow: line.outflow,
    transferId: line.transferId ?? null,
    transferAccountId: line.transferAccountId ?? null,
    transferTransactionId: line.transferTransactionId ?? null,
  };
}

export function transactionEntityValues(transaction: TransactionEntitySource): TransactionEntityFields {
  return {
    accountId: transaction.accountId,
    date: transaction.date,
    tagIds: [...new Set(transaction.tagIds ?? [])],
    attachments: (transaction.attachments ?? []).map(normaliseAttachment),
    payee: transaction.payee,
    rawPayee: transaction.rawPayee ?? null,
    payeeId: transaction.payeeId ?? null,
    category: transaction.category,
    categoryId: transaction.categoryId ?? null,
    memo: transaction.memo ?? null,
    checkNumber: transaction.checkNumber ?? null,
    inflow: transaction.inflow,
    outflow: transaction.outflow,
    cleared: transaction.cleared,
    reconciled: transaction.reconciled,
    transferId: transaction.transferId ?? null,
    transferAccountId: transaction.transferAccountId ?? null,
    transferTransactionId: transaction.transferTransactionId ?? null,
    splitLines: (transaction.splitLines ?? []).map(normaliseSplitLine),
    generatedFromSchedule: transaction.generatedFromSchedule ?? false,
    scheduledTransactionId: transaction.scheduledTransactionId ?? null,
    scheduledOccurrenceDate: transaction.scheduledOccurrenceDate ?? null,
  };
}

export function createTransactionEntity(
  transaction: TransactionEntitySource,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionEntityFields> {
  const values = transactionEntityValues(transaction);
  return Object.freeze({
    metadata: Object.freeze({ id: transaction.id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze(Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, createLwwRegister(value, timestamp)]),
    )) as ReplicatedEntity<TransactionEntityFields>["fields"],
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function updateTransactionEntity(
  existing: ReplicatedEntity<TransactionEntityFields>,
  transaction: TransactionEntitySource,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionEntityFields> {
  if (existing.metadata.id !== transaction.id) {
    throw new TypeError("Cannot update a transaction entity with a different transaction id.");
  }
  const values = transactionEntityValues(transaction);
  const fields = { ...existing.fields } as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    const current = (existing.fields as Record<string, { value: unknown }>)[key];
    if (!current || !sameValue(current.value, value)) {
      fields[key] = createLwwRegister(value, timestamp);
    }
  }
  return Object.freeze({
    metadata: Object.freeze({ ...existing.metadata, tombstone: null }),
    fields: Object.freeze(fields) as ReplicatedEntity<TransactionEntityFields>["fields"],
  });
}

export function tombstoneTransactionEntity(
  entity: ReplicatedEntity<TransactionEntityFields>,
  timestamp: HybridTimestamp,
): ReplicatedEntity<TransactionEntityFields> {
  return Object.freeze({
    metadata: Object.freeze({ ...entity.metadata, tombstone: timestamp }),
    fields: entity.fields,
  });
}

export function projectTransactionEntity(
  entity: ReplicatedEntity<TransactionEntityFields>,
  runningBalance = 0,
): RegisterTransactionView & { accountId: string } {
  const values = Object.fromEntries(
    Object.entries(entity.fields).map(([key, register]) => [key, register.value]),
  ) as unknown as TransactionEntityFields;
  return {
    id: entity.metadata.id,
    accountId: values.accountId,
    date: values.date,
    tagIds: [...values.tagIds],
    attachmentCount: values.attachments.length,
    attachments: values.attachments.map((attachment) => ({
      ...attachment,
      contentDataUrl: attachment.contentDataUrl ?? undefined,
      contentRef: attachment.contentRef ?? undefined,
      contentHash: attachment.contentHash ?? undefined,
      storageType: attachment.storageType ?? undefined,
    })),
    payee: values.payee,
    rawPayee: values.rawPayee ?? undefined,
    payeeId: values.payeeId ?? undefined,
    category: values.category,
    categoryId: values.categoryId ?? undefined,
    memo: values.memo ?? undefined,
    checkNumber: values.checkNumber ?? undefined,
    inflow: values.inflow,
    outflow: values.outflow,
    runningBalance,
    cleared: values.cleared,
    reconciled: values.reconciled,
    transferId: values.transferId ?? undefined,
    transferAccountId: values.transferAccountId ?? undefined,
    transferTransactionId: values.transferTransactionId ?? undefined,
    splitLines: values.splitLines.length > 0 ? values.splitLines.map((line) => ({
      ...line,
      categoryId: line.categoryId ?? undefined,
      memo: line.memo ?? undefined,
      transferId: line.transferId ?? undefined,
      transferAccountId: line.transferAccountId ?? undefined,
      transferTransactionId: line.transferTransactionId ?? undefined,
    })) : undefined,
    generatedFromSchedule: values.generatedFromSchedule || undefined,
    scheduledTransactionId: values.scheduledTransactionId ?? undefined,
    scheduledOccurrenceDate: values.scheduledOccurrenceDate ?? undefined,
  };
}

export function mergeTransactionEntities(
  left: ReplicatedEntity<TransactionEntityFields>,
  right: ReplicatedEntity<TransactionEntityFields>,
): ReplicatedEntity<TransactionEntityFields> {
  if (left.metadata.id !== right.metadata.id) {
    throw new TypeError("Cannot merge different transactions.");
  }
  const tombstone = !left.metadata.tombstone
    ? right.metadata.tombstone
    : !right.metadata.tombstone
      ? left.metadata.tombstone
      : compareHybridTimestamps(left.metadata.tombstone, right.metadata.tombstone) >= 0
        ? left.metadata.tombstone
        : right.metadata.tombstone;
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(left.fields) as (keyof TransactionEntityFields)[]) {
    fields[key] = mergeLwwRegisters((left.fields as any)[key], (right.fields as any)[key]);
  }
  return Object.freeze({
    metadata: Object.freeze({ ...left.metadata, tombstone }),
    fields: Object.freeze(fields) as ReplicatedEntity<TransactionEntityFields>["fields"],
  });
}
