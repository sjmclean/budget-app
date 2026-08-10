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
import type { SidebarAccount, SidebarAccountType } from "../accountService.js";

export const ACCOUNT_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/account-index";
export const ACCOUNT_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/account/";

export type AccountEntityFields = {
  name: string;
  type: SidebarAccountType;
  startingBalance: number;
  createdAt: string;
  closedAt: string | null;
};

function validFields(fields: Readonly<Record<string, unknown>>): fields is AccountEntityFields {
  return typeof fields.name === "string" &&
    (fields.type === "on-budget" || fields.type === "credit-card" || fields.type === "tracking") &&
    typeof fields.startingBalance === "number" && Number.isFinite(fields.startingBalance) &&
    typeof fields.createdAt === "string" &&
    (fields.closedAt === null || typeof fields.closedAt === "string");
}

export function createAccountEntityRepository(storage: KeyValueStoragePort) {
  const adapter: EntityRecordStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    listKeys: () => storage.listKeys?.() ?? [],
    flush: storage.flush ? () => storage.flush!() : undefined,
  };
  const base = createEntityRepository<AccountEntityFields>({
    entityType: "account",
    storage: adapter,
    codec: createJsonReplicatedEntityCodec<AccountEntityFields>(validFields),
  });
  const indexKey = ACCOUNT_ENTITY_INDEX_KEY;
  const readIds = (): string[] => {
    const raw = storage.getItem(indexKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").sort() : [];
    } catch { return []; }
  };
  const writeIds = (ids: string[]) => storage.setItem(indexKey, JSON.stringify([...new Set(ids)].sort()));
  return Object.freeze({
    entityType: base.entityType,
    get: (id: string) => base.get(id),
    has: (id: string) => base.has(id),
    save(entity: ReplicatedEntity<AccountEntityFields>) {
      base.save(entity);
      writeIds([...readIds(), entity.metadata.id]);
    },
    list(options: { includeTombstoned?: boolean } = {}) {
      // Entity records are authoritative. The index is a derived compatibility
      // aid and can lag behind records after an interrupted import or remote
      // replication. Accounts are small enough to discover directly without
      // risking the transaction-scale materialisation problem.
      return base.list(options);
    },
    purge(id: string) { base.purge(id); writeIds(readIds().filter((candidate) => candidate !== id)); },
    flush: () => base.flush(),
  });
}

export function createAccountEntity(account: SidebarAccount, timestamp: HybridTimestamp): ReplicatedEntity<AccountEntityFields> {
  return Object.freeze({
    metadata: Object.freeze({ id: account.id, createdAt: timestamp, tombstone: null }),
    fields: Object.freeze({
      name: createLwwRegister(account.name, timestamp),
      type: createLwwRegister(account.type, timestamp),
      startingBalance: createLwwRegister(account.startingBalance, timestamp),
      createdAt: createLwwRegister(account.createdAt, timestamp),
      closedAt: createLwwRegister(account.closedAt ?? null, timestamp),
    }),
  });
}

export function projectAccount(entity: ReplicatedEntity<AccountEntityFields>): SidebarAccount {
  return {
    id: entity.metadata.id,
    name: entity.fields.name.value,
    type: entity.fields.type.value,
    startingBalance: entity.fields.startingBalance.value,
    createdAt: entity.fields.createdAt.value,
    closedAt: entity.fields.closedAt.value,
  };
}

export function updateAccountEntity(
  entity: ReplicatedEntity<AccountEntityFields>,
  changes: Partial<AccountEntityFields>,
  timestamp: HybridTimestamp,
): ReplicatedEntity<AccountEntityFields> {
  const fields = { ...entity.fields };
  for (const [key, value] of Object.entries(changes) as [keyof AccountEntityFields, AccountEntityFields[keyof AccountEntityFields]][]) {
    (fields as any)[key] = createLwwRegister(value, timestamp);
  }
  return Object.freeze({ metadata: entity.metadata, fields: Object.freeze(fields) });
}

export function tombstoneAccountEntity(entity: ReplicatedEntity<AccountEntityFields>, timestamp: HybridTimestamp): ReplicatedEntity<AccountEntityFields> {
  return Object.freeze({ metadata: Object.freeze({ ...entity.metadata, tombstone: timestamp }), fields: entity.fields });
}

export function mergeAccountEntities(left: ReplicatedEntity<AccountEntityFields>, right: ReplicatedEntity<AccountEntityFields>): ReplicatedEntity<AccountEntityFields> {
  if (left.metadata.id !== right.metadata.id) throw new TypeError("Cannot merge different accounts.");
  const tombstone = !left.metadata.tombstone ? right.metadata.tombstone : !right.metadata.tombstone ? left.metadata.tombstone :
    compareHybridTimestamps(left.metadata.tombstone, right.metadata.tombstone) >= 0
      ? left.metadata.tombstone : right.metadata.tombstone;
  return Object.freeze({
    metadata: Object.freeze({ ...left.metadata, tombstone }),
    fields: Object.freeze({
      name: mergeLwwRegisters(left.fields.name, right.fields.name),
      type: mergeLwwRegisters(left.fields.type, right.fields.type),
      startingBalance: mergeLwwRegisters(left.fields.startingBalance, right.fields.startingBalance),
      createdAt: mergeLwwRegisters(left.fields.createdAt, right.fields.createdAt),
      closedAt: mergeLwwRegisters(left.fields.closedAt, right.fields.closedAt),
    }),
  });
}

export function timestampFor(now: Date, counter = 0): HybridTimestamp {
  return createHybridTimestamp(now.getTime(), counter, "account-service");
}

export function replaceAccountEntities(
  storage: KeyValueStoragePort,
  accounts: readonly SidebarAccount[],
  now = new Date(),
): void {
  const repository = createAccountEntityRepository(storage);
  for (const entity of repository.list({ includeTombstoned: true })) repository.purge(entity.metadata.id);
  accounts.forEach((account, index) => repository.save(createAccountEntity(account, timestampFor(now, index))));
}
