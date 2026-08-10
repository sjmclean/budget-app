import type { ReplicatedEntity } from "../primitives/ReplicatedEntity.js";
import { compareHybridTimestamps } from "../primitives/HybridTimestamp.js";
import { mergeLwwRegisters, type LwwRegister } from "../primitives/LwwRegister.js";
import { createJsonReplicatedEntityCodec } from "./ReplicatedEntityCodec.js";
import type { EntityRecordStorage } from "./EntityRecordStorage.js";
import type { ReplicatedEntityCodec } from "./ReplicatedEntityCodec.js";

const ENTITY_RECORD_SCHEMA_VERSION = 1;
const DEFAULT_NAMESPACE = "budget-app.entity-replication";

type EntityEnvelope = Readonly<{
  schemaVersion: typeof ENTITY_RECORD_SCHEMA_VERSION;
  entityType: string;
  payload: string;
}>;

export type EntityListOptions = Readonly<{
  includeTombstoned?: boolean;
}>;

export interface EntityRepository<T extends object> {
  readonly entityType: string;
  get(id: string): ReplicatedEntity<T> | null;
  has(id: string): boolean;
  save(entity: ReplicatedEntity<T>): void;
  list(options?: EntityListOptions): ReplicatedEntity<T>[];
  purge(id: string): void;
  flush(): Promise<void>;
}

export class EntityRepositoryCorruptionError extends Error {
  readonly recordKey: string;

  constructor(recordKey: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EntityRepositoryCorruptionError";
    this.recordKey = recordKey;
  }
}

export type CreateEntityRepositoryOptions<T extends object> = Readonly<{
  entityType: string;
  storage: EntityRecordStorage;
  codec: ReplicatedEntityCodec<T>;
  namespace?: string;
}>;

function assertSegment(name: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`${name} must not be empty.`);
  }
  return trimmed;
}

function recordPrefix(namespace: string, entityType: string): string {
  return `${namespace}.v${ENTITY_RECORD_SCHEMA_VERSION}/${encodeURIComponent(entityType)}/`;
}

function recordKey(prefix: string, id: string): string {
  return `${prefix}${encodeURIComponent(assertSegment("entity id", id))}`;
}

function parseEnvelope(raw: string, key: string, entityType: string): EntityEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new EntityRepositoryCorruptionError(key, "Entity envelope is not valid JSON.", {
      cause: error,
    });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new EntityRepositoryCorruptionError(key, "Entity envelope must be an object.");
  }

  const envelope = parsed as Partial<EntityEnvelope>;
  if (envelope.schemaVersion !== ENTITY_RECORD_SCHEMA_VERSION) {
    throw new EntityRepositoryCorruptionError(key, "Entity envelope schema version is unsupported.");
  }
  if (envelope.entityType !== entityType) {
    throw new EntityRepositoryCorruptionError(key, "Entity envelope type does not match its repository.");
  }
  if (typeof envelope.payload !== "string") {
    throw new EntityRepositoryCorruptionError(key, "Entity envelope payload must be a string.");
  }

  return envelope as EntityEnvelope;
}


/**
 * Merges two serialized entity-repository records without requiring a domain
 * codec. Returns null when either value is not a compatible entity envelope,
 * allowing callers to retain ordinary key/value replacement semantics.
 */
export function mergeSerializedEntityRecords(
  localRaw: string,
  remoteRaw: string,
): string | null {
  let localEnvelope: EntityEnvelope;
  let remoteEnvelope: EntityEnvelope;
  try {
    localEnvelope = parseAnyEnvelope(localRaw);
    remoteEnvelope = parseAnyEnvelope(remoteRaw);
  } catch {
    return null;
  }
  if (localEnvelope.entityType !== remoteEnvelope.entityType) return null;

  const codec = createJsonReplicatedEntityCodec<Record<string, unknown>>();
  let local: ReplicatedEntity<Record<string, unknown>>;
  let remote: ReplicatedEntity<Record<string, unknown>>;
  try {
    local = codec.deserialize(localEnvelope.payload);
    remote = codec.deserialize(remoteEnvelope.payload);
  } catch {
    return null;
  }
  if (local.metadata.id !== remote.metadata.id) return null;

  const fieldNames = new Set([
    ...Object.keys(local.fields),
    ...Object.keys(remote.fields),
  ]);
  const fields: Record<string, LwwRegister<unknown>> = {};
  for (const fieldName of fieldNames) {
    const left = local.fields[fieldName];
    const right = remote.fields[fieldName];
    fields[fieldName] = left && right
      ? mergeLwwRegisters(left, right)
      : (left ?? right)!;
  }

  const tombstone = !local.metadata.tombstone
    ? remote.metadata.tombstone
    : !remote.metadata.tombstone
      ? local.metadata.tombstone
      : compareHybridTimestamps(local.metadata.tombstone, remote.metadata.tombstone) >= 0
        ? local.metadata.tombstone
        : remote.metadata.tombstone;
  const createdAt = compareHybridTimestamps(local.metadata.createdAt, remote.metadata.createdAt) <= 0
    ? local.metadata.createdAt
    : remote.metadata.createdAt;
  const merged: ReplicatedEntity<Record<string, unknown>> = Object.freeze({
    metadata: Object.freeze({ id: local.metadata.id, createdAt, tombstone }),
    fields: Object.freeze(fields),
  });
  return JSON.stringify({
    schemaVersion: ENTITY_RECORD_SCHEMA_VERSION,
    entityType: localEnvelope.entityType,
    payload: codec.serialize(merged),
  } satisfies EntityEnvelope);
}

function parseAnyEnvelope(raw: string): EntityEnvelope {
  const parsed = JSON.parse(raw) as Partial<EntityEnvelope>;
  if (
    parsed?.schemaVersion !== ENTITY_RECORD_SCHEMA_VERSION ||
    typeof parsed.entityType !== "string" ||
    parsed.entityType.trim().length === 0 ||
    typeof parsed.payload !== "string"
  ) {
    throw new TypeError("Not an entity repository envelope.");
  }
  return parsed as EntityEnvelope;
}

export function createEntityRepository<T extends object>(
  options: CreateEntityRepositoryOptions<T>,
): EntityRepository<T> {
  const entityType = assertSegment("entityType", options.entityType);
  const namespace = assertSegment("namespace", options.namespace ?? DEFAULT_NAMESPACE);
  const prefix = recordPrefix(namespace, entityType);

  const readByKey = (key: string): ReplicatedEntity<T> | null => {
    const raw = options.storage.getItem(key);
    if (raw === null) return null;

    const envelope = parseEnvelope(raw, key, entityType);
    let entity: ReplicatedEntity<T>;
    try {
      entity = options.codec.deserialize(envelope.payload);
    } catch (error) {
      throw new EntityRepositoryCorruptionError(key, "Entity payload could not be decoded.", {
        cause: error,
      });
    }

    const encodedId = key.slice(prefix.length);
    let keyId: string;
    try {
      keyId = decodeURIComponent(encodedId);
    } catch (error) {
      throw new EntityRepositoryCorruptionError(key, "Entity record key contains an invalid encoded ID.", {
        cause: error,
      });
    }

    if (entity.metadata.id !== keyId) {
      throw new EntityRepositoryCorruptionError(key, "Entity payload ID does not match its record key.");
    }

    return entity;
  };

  return Object.freeze({
    entityType,

    get(id: string): ReplicatedEntity<T> | null {
      return readByKey(recordKey(prefix, id));
    },

    has(id: string): boolean {
      return options.storage.getItem(recordKey(prefix, id)) !== null;
    },

    save(entity: ReplicatedEntity<T>): void {
      const key = recordKey(prefix, entity.metadata.id);
      const envelope: EntityEnvelope = {
        schemaVersion: ENTITY_RECORD_SCHEMA_VERSION,
        entityType,
        payload: options.codec.serialize(entity),
      };
      options.storage.setItem(key, JSON.stringify(envelope));
    },

    list(listOptions: EntityListOptions = {}): ReplicatedEntity<T>[] {
      const includeTombstoned = listOptions.includeTombstoned ?? false;
      return options.storage
        .listKeys()
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((key) => readByKey(key))
        .filter((entity): entity is ReplicatedEntity<T> => entity !== null)
        .filter((entity) => includeTombstoned || entity.metadata.tombstone === null)
        .sort((left, right) => left.metadata.id.localeCompare(right.metadata.id));
    },

    purge(id: string): void {
      options.storage.removeItem(recordKey(prefix, id));
    },

    async flush() {
      await options.storage.flush?.();
    },
  });
}
