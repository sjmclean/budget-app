import { mergeSerializedEntityRecords } from "../../../../../packages/sync/src/browser.js";
import {
  applyOperationsToCheckpointEntries,
  assertCheckpointIsInScope,
  assertCompatibleCheckpoint,
  budgetPersistenceKeyPrefix,
  checkpointMetadata,
  createPersistenceCheckpoint,
  calculateCheckpointIntegrityHash,
  type CheckpointPort,
  type CheckpointRestoreResult,
  type PersistenceCheckpoint,
  type PersistenceCheckpointMetadata,
} from "./checkpoint";
import { isCanonicalBudgetStorageKey } from "./persistenceSnapshot";
import {
  filterCanonicalOperationJournalEntries,
  filterCanonicalPersistenceEntries,
  mergeRestoredCanonicalPersistenceEntries,
} from "./persistenceKeyClassification";
import {
  createConflictId,
  mutationsAreEquivalent,
  type ReplicationConflict,
  type ReplicationConflictStatus,
} from "./conflictResolution";
import type {
  KeyValueStorageMutation,
  KeyValueStoragePort,
} from "./keyValueStoragePort";
import { createSerializedWriteCoordinator } from "./keyValueStoragePort";
import {
  createOperationJournalEntry,
  type OperationJournalCursor,
  type OperationJournalEntry,
  type OperationJournalMutation,
} from "./operationJournal";
import type {
  RemoteOperationEnvelope,
  ReplicationApplyContext,
  ReplicationCursorState,
  ReplicationDiagnostics,
  ReplicationLocalStorePort,
} from "./replication";

const DEFAULT_DATABASE_NAME = "budget-app-local-database-v1";
const DATABASE_VERSION = 4;
const RECORD_STORE = "records";
const META_STORE = "metadata";
const JOURNAL_STORE = "operation-journal";
const CHECKPOINT_STORE = "checkpoints";
const CONFLICT_STORE = "replication-conflicts";
const SCHEMA_VERSION_KEY = "schema-version";
const DEVICE_ID_KEY = "device-id";
const LATEST_SEQUENCE_KEY = "operation-journal.latest-sequence";
const LATEST_CHECKPOINT_ID_KEY = "checkpoint.latest-id";
const CURRENT_SCHEMA_VERSION = 4;
const REPLICATION_GENERATION_KEY = "replication.generation-id";
const REPLICATION_PUSHED_SEQUENCE_KEY = "replication.pushed-local-sequence";
const REPLICATION_PULLED_CURSOR_KEY = "replication.pulled-remote-cursor";
const MAX_RETAINED_CHECKPOINTS = 5;

export interface LocalDatabaseKeyValueStorage extends KeyValueStoragePort, CheckpointPort, ReplicationLocalStorePort {
  initialize(): Promise<void>;
  isEmpty(): boolean;
  replaceAll(entries: Readonly<Record<string, string>>): Promise<void>;
  flush(): Promise<void>;
  getJournalCursor(): OperationJournalCursor;
  readJournal(afterSequence?: number, limit?: number): Promise<OperationJournalEntry[]>;
  createCheckpoint(scope?: string): Promise<PersistenceCheckpoint>;
  getLatestCheckpoint(scope?: string): Promise<PersistenceCheckpoint | null>;
  listCheckpoints(limit?: number): Promise<PersistenceCheckpointMetadata[]>;
  restoreCheckpoint(
    checkpoint: PersistenceCheckpoint,
    laterOperations?: readonly OperationJournalEntry[],
    scope?: string,
  ): Promise<CheckpointRestoreResult>;
  calculateStateIntegrityHash(scope?: string): Promise<string>;
  getReplicationDiagnostics(scope?: string): Promise<ReplicationDiagnostics>;
  pruneJournal(throughSequence: number, scope?: string): Promise<number>;
  listConflicts(options?: { status?: ReplicationConflictStatus; limit?: number }): Promise<ReplicationConflict[]>;
  resolveConflict(conflictId: string, resolution: "keep-local" | "accept-remote"): Promise<void>;
}

/**
 * Browser-local authoritative database boundary.
 *
 * IndexedDB is used here as the browser runtime's durable database engine. Each
 * mutation and its journal entry are committed in one IndexedDB transaction,
 * so durable state and future sync history cannot diverge.
 */
export function createLocalDatabaseKeyValueStorage(options: {
  readonly namespace?: string;
} = {}): LocalDatabaseKeyValueStorage {
  const databaseName = options.namespace
    ? `${DEFAULT_DATABASE_NAME}-${options.namespace.replace(/[^a-zA-Z0-9_-]/g, "_")}`
    : DEFAULT_DATABASE_NAME;
  const mirror = new Map<string, string>();
  const writes = createSerializedWriteCoordinator();
  let initialized = false;
  let deviceId = "";
  let latestSequence = 0;

  const api: LocalDatabaseKeyValueStorage = {
    async initialize(): Promise<void> {
      if (initialized) return;
      const db = await openDatabase(databaseName);

      try {
        const metadata = await ensureDatabaseMetadata(db);
        deviceId = metadata.deviceId;
        latestSequence = metadata.latestSequence;
        const rows = await readAllRecords(db);
        mirror.clear();
        for (const row of rows) {
          mirror.set(row.key, row.value);
        }
        initialized = true;
      } finally {
        db.close();
      }
    },

    getItem(key: string): string | null {
      assertInitialized(initialized);
      return mirror.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      assertInitialized(initialized);
      mirror.set(key, value);
      const mutation: OperationJournalMutation = { type: "key-value.set", key, value };
      if (!isCanonicalBudgetStorageKey(key)) {
        writes.queue(() => commitLocalMutation(mutation));
        return;
      }
      const sequence = ++latestSequence;
      const entry = createOperationJournalEntry({
        deviceId,
        sequence,
        mutation,
      });
      writes.queue(() => commitMutation(entry));
    },

    removeItem(key: string): void {
      assertInitialized(initialized);
      mirror.delete(key);
      const mutation: OperationJournalMutation = { type: "key-value.remove", key };
      if (!isCanonicalBudgetStorageKey(key)) {
        writes.queue(() => commitLocalMutation(mutation));
        return;
      }
      const sequence = ++latestSequence;
      const entry = createOperationJournalEntry({
        deviceId,
        sequence,
        mutation,
      });
      writes.queue(() => commitMutation(entry));
    },

    listKeys(): string[] {
      assertInitialized(initialized);
      return [...mirror.keys()].sort();
    },

    async flush(): Promise<void> {
      await writes.flush();
    },

    async applyMutations(
      mutations: readonly KeyValueStorageMutation[],
    ): Promise<void> {
      assertInitialized(initialized);
      if (mutations.length === 0) return;
      const journalEntries: OperationJournalEntry[] = [];
      const operationMutations = mutations.map((mutation) => {
        const operation: OperationJournalMutation = mutation.type === "set"
          ? { type: "key-value.set", key: mutation.key, value: mutation.value }
          : { type: "key-value.remove", key: mutation.key };
        if (isCanonicalBudgetStorageKey(mutation.key)) {
          journalEntries.push(createOperationJournalEntry({
            deviceId,
            sequence: ++latestSequence,
            mutation: operation,
          }));
        }
        return operation;
      });
      for (const mutation of mutations) {
        if (mutation.type === "set") mirror.set(mutation.key, mutation.value);
        else mirror.delete(mutation.key);
      }
      writes.queue(async () => {
        const db = await openDatabase(databaseName);
        try {
          await commitMutationBatch(db, operationMutations, journalEntries);
        } finally {
          db.close();
        }
      });
      await writes.flush();
    },

    isEmpty(): boolean {
      assertInitialized(initialized);
      return mirror.size === 0;
    },

    async replaceAll(entries: Readonly<Record<string, string>>): Promise<void> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase(databaseName);
      try {
        await replaceAllRecords(db, entries);
        mirror.clear();
        for (const [key, value] of Object.entries(entries)) {
          mirror.set(key, value);
        }
      } finally {
        db.close();
      }
    },

    getJournalCursor(): OperationJournalCursor {
      assertInitialized(initialized);
      return { deviceId, latestSequence };
    },

    async readJournal(afterSequence = 0, limit = 500): Promise<OperationJournalEntry[]> {
      assertInitialized(initialized);
      await writes.flush();
      if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
        throw new Error("Journal cursors must be non-negative integers.");
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
        throw new Error("Journal read limits must be between 1 and 5000.");
      }
      const db = await openDatabase(databaseName);
      try {
        return await readJournalEntries(db, afterSequence, limit);
      } finally {
        db.close();
      }
    },

    async createCheckpoint(scope?: string): Promise<PersistenceCheckpoint> {
      assertInitialized(initialized);
      const prefix = scope ? budgetPersistenceKeyPrefix(scope) : null;
      const capturedEntries = Object.fromEntries(
        [...mirror.entries()].filter(([key]) =>
          isCanonicalBudgetStorageKey(key) && (!prefix || key.startsWith(prefix))),
      );
      const capturedSequence = latestSequence;
      const checkpoint = createPersistenceCheckpoint({
        deviceId,
        throughSequence: capturedSequence,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        entries: capturedEntries,
      });
      writes.queue(() => persistCheckpoint(checkpoint, scope));
      await writes.flush();
      return checkpoint;
    },


    async calculateStateIntegrityHash(scope?: string): Promise<string> {
      assertInitialized(initialized);
      await writes.flush();
      const prefix = scope ? budgetPersistenceKeyPrefix(scope) : null;
      return calculateCheckpointIntegrityHash(
        Object.fromEntries(
          [...mirror.entries()].filter(([key]) =>
            isCanonicalBudgetStorageKey(key) && (!prefix || key.startsWith(prefix))),
        ),
      );
    },

    async getLatestCheckpoint(scope?: string): Promise<PersistenceCheckpoint | null> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase(databaseName);
      try {
        return await readLatestCheckpoint(db, scope);
      } finally {
        db.close();
      }
    },

    async listCheckpoints(limit = MAX_RETAINED_CHECKPOINTS): Promise<PersistenceCheckpointMetadata[]> {
      assertInitialized(initialized);
      await writes.flush();
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("Checkpoint list limits must be between 1 and 100.");
      }
      const db = await openDatabase(databaseName);
      try {
        const checkpoints = await readCheckpoints(db, limit);
        return checkpoints.map(checkpointMetadata);
      } finally {
        db.close();
      }
    },

    async getReplicationCursorState(scope?: string): Promise<ReplicationCursorState> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase(databaseName);
      try {
        return await readReplicationCursorState(db, scope);
      } finally {
        db.close();
      }
    },

    async setReplicationCursorState(
      state: ReplicationCursorState,
      scope?: string,
    ): Promise<void> {
      assertInitialized(initialized);
      validateReplicationCursorState(state);
      writes.queue(async () => {
        const db = await openDatabase(databaseName);
        try {
          await writeReplicationCursorState(db, state, scope);
        } finally {
          db.close();
        }
      });
      await writes.flush();
    },

    async getReplicationDiagnostics(scope?: string): Promise<ReplicationDiagnostics> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase(databaseName);
      try {
        const [journal, checkpoints, cursor] = await Promise.all([
          readJournalStatistics(db),
          readCheckpointStatistics(db),
          readReplicationCursorState(db, scope),
        ]);
        return {
          deviceId,
          latestLocalSequence: latestSequence,
          retainedJournalEntryCount: journal.count,
          oldestRetainedSequence: journal.oldestSequence,
          latestCheckpointId: checkpoints.latestCheckpointId,
          checkpointCount: checkpoints.count,
          generationId: cursor.generationId,
          pushedLocalSequence: cursor.pushedLocalSequence,
          pulledRemoteCursor: cursor.pulledRemoteCursor,
          unresolvedConflictCount: await countUnresolvedConflicts(db),
        };
      } finally {
        db.close();
      }
    },

    async pruneJournal(throughSequence: number, scope?: string): Promise<number> {
      assertInitialized(initialized);
      if (!Number.isSafeInteger(throughSequence) || throughSequence < 0) {
        throw new Error("Journal pruning boundaries must be non-negative integers.");
      }
      await writes.flush();
      const db = await openDatabase(databaseName);
      try {
        return await pruneJournalEntries(db, throughSequence, scope);
      } finally {
        db.close();
      }
    },

    async applyRemoteOperations(
      operations: readonly RemoteOperationEnvelope[],
      context?: ReplicationApplyContext,
    ): Promise<number> {
      assertInitialized(initialized);
      if (operations.length === 0) return 0;
      await writes.flush();
      const sorted = [...operations]
        .filter((envelope) => isCanonicalBudgetStorageKey(envelope.operation.mutation.key))
        .sort((left, right) => left.cursor - right.cursor);
      if (sorted.length === 0) return 0;
      const db = await openDatabase(databaseName);
      try {
        const canonicalLocalOperations = context
          ? filterCanonicalOperationJournalEntries(context.localOperations)
          : undefined;
        const resolved = resolveRemoteEntityOperations(sorted, mirror);
        const conflicts = detectReplicationConflicts(
          resolved,
          context && canonicalLocalOperations
            ? { ...context, localOperations: canonicalLocalOperations }
            : context,
        );
        const applied = await applyRemoteOperationsTransaction(db, resolved, conflicts);
        for (const envelope of resolved) {
          const mutation = envelope.operation.mutation;
          if (mutation.type === "key-value.set") mirror.set(mutation.key, mutation.value);
          else mirror.delete(mutation.key);
        }
        return applied;
      } finally {
        db.close();
      }
    },


    async listConflicts(
      options: { status?: ReplicationConflictStatus; limit?: number } = {},
    ): Promise<ReplicationConflict[]> {
      assertInitialized(initialized);
      await writes.flush();
      const limit = options.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
        throw new Error("Conflict list limits must be between 1 and 1000.");
      }
      const db = await openDatabase(databaseName);
      try {
        return await readReplicationConflicts(db, options.status, limit);
      } finally {
        db.close();
      }
    },

    async resolveConflict(
      conflictId: string,
      resolution: "keep-local" | "accept-remote",
    ): Promise<void> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase(databaseName);
      let conflict: ReplicationConflict | null = null;
      try {
        conflict = await markConflictResolved(db, conflictId, resolution);
      } finally {
        db.close();
      }
      if (!conflict) throw new Error("The replication conflict no longer exists.");
      if (resolution === "keep-local") {
        const mutation = conflict.localMutation;
        if (mutation.type === "key-value.set") api.setItem(mutation.key, mutation.value);
        else api.removeItem(mutation.key);
        await api.flush();
      }
    },

    async restoreCheckpoint(
      checkpoint: PersistenceCheckpoint,
      laterOperations: readonly OperationJournalEntry[] = [],
      scope?: string,
    ): Promise<CheckpointRestoreResult> {
      assertInitialized(initialized);
      assertCompatibleCheckpoint(checkpoint, CURRENT_SCHEMA_VERSION);
      if (scope) assertCheckpointIsInScope(checkpoint, scope);
      const prefix = scope ? budgetPersistenceKeyPrefix(scope) : null;
      if (
        prefix &&
        laterOperations.some(({ mutation }) => !mutation.key.startsWith(prefix))
      ) {
        throw new Error(`Checkpoint recovery operations contain data outside budget ${scope}.`);
      }
      const canonicalCheckpoint = createPersistenceCheckpoint({
        checkpointId: checkpoint.checkpointId,
        deviceId: checkpoint.deviceId,
        throughSequence: checkpoint.throughSequence,
        schemaVersion: checkpoint.schemaVersion,
        createdAt: new Date(checkpoint.createdAt),
        replicatedThroughCursor: checkpoint.replicatedThroughCursor ?? 0,
        entries: filterCanonicalPersistenceEntries(checkpoint.entries),
      });
      const canonicalLaterOperations = filterCanonicalOperationJournalEntries(laterOperations);
      const restoredEntries = applyOperationsToCheckpointEntries(
        canonicalCheckpoint,
        canonicalLaterOperations,
      );
      const restoredCheckpoint = createPersistenceCheckpoint({
        deviceId,
        throughSequence: 0,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        replicatedThroughCursor: checkpoint.replicatedThroughCursor ?? 0,
        entries: restoredEntries,
      });

      await writes.flush();
      const db = await openDatabase(databaseName);
      try {
        await restoreDatabaseFromCheckpoint(db, restoredEntries, restoredCheckpoint, scope);
        const mergedEntries = scope
          ? mergeScopedPersistenceEntries(Object.fromEntries(mirror.entries()), restoredEntries, scope)
          : mergeRestoredCanonicalPersistenceEntries(
              Object.fromEntries(mirror.entries()),
              restoredEntries,
            );
        mirror.clear();
        for (const [key, value] of Object.entries(mergedEntries)) mirror.set(key, value);
        if (!scope) latestSequence = 0;
      } finally {
        db.close();
      }

      return {
        restoredCheckpointId: restoredCheckpoint.checkpointId,
        appliedOperationCount: new Set(canonicalLaterOperations.map((entry) => entry.operationId)).size,
        entryCount: restoredCheckpoint.entryCount,
      };
    },
  };

  return api;

  async function commitMutation(entry: OperationJournalEntry): Promise<void> {
    const db = await openDatabase(databaseName);
    try {
      await commitRecordAndJournal(db, entry);
    } finally {
      db.close();
    }
  }

  async function commitLocalMutation(mutation: OperationJournalMutation): Promise<void> {
    const db = await openDatabase(databaseName);
    try {
      await commitRecordOnly(db, mutation);
    } finally {
      db.close();
    }
  }

  async function persistCheckpoint(
    checkpoint: PersistenceCheckpoint,
    scope?: string,
  ): Promise<void> {
    const db = await openDatabase(databaseName);
    try {
      await writeCheckpoint(db, checkpoint, scope);
    } finally {
      db.close();
    }
  }
}

function assertInitialized(initialized: boolean): void {
  if (!initialized) {
    throw new Error("The local database was accessed before initialize() completed.");
  }
}

function openDatabase(databaseName: string = DEFAULT_DATABASE_NAME): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable; the local database cannot start."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        db.createObjectStore(RECORD_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        const journal = db.createObjectStore(JOURNAL_STORE, { keyPath: "sequence" });
        journal.createIndex("operationId", "operationId", { unique: true });
      }
      if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        const checkpoints = db.createObjectStore(CHECKPOINT_STORE, { keyPath: "checkpointId" });
        checkpoints.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        const conflicts = db.createObjectStore(CONFLICT_STORE, { keyPath: "conflictId" });
        conflicts.createIndex("status", "status", { unique: false });
        conflicts.createIndex("detectedAt", "detectedAt", { unique: false });
      }
    };

    request.onerror = () => reject(request.error ?? new Error("Unable to open the local database."));
    request.onsuccess = () => resolve(request.result);
  });
}

function ensureDatabaseMetadata(
  db: IDBDatabase,
): Promise<{ deviceId: string; latestSequence: number }> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    let deviceId = "";
    let latestSequence = 0;
    let pendingReads = 2;

    const finishReads = () => {
      pendingReads -= 1;
      if (pendingReads !== 0) return;
      store.put({ key: SCHEMA_VERSION_KEY, value: CURRENT_SCHEMA_VERSION });
      store.put({ key: DEVICE_ID_KEY, value: deviceId });
      store.put({ key: LATEST_SEQUENCE_KEY, value: latestSequence });
    };

    const schemaRequest = store.get(SCHEMA_VERSION_KEY);
    schemaRequest.onsuccess = () => {
      const stored = schemaRequest.result as { key: string; value: number } | undefined;
      if (stored && stored.value > CURRENT_SCHEMA_VERSION) {
        transaction.abort();
        reject(new Error(`Local database schema ${stored.value} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`));
      }
    };

    const deviceRequest = store.get(DEVICE_ID_KEY);
    deviceRequest.onsuccess = () => {
      const stored = deviceRequest.result as { key: string; value: string } | undefined;
      deviceId = stored?.value || createDeviceId();
      finishReads();
    };

    const sequenceRequest = store.get(LATEST_SEQUENCE_KEY);
    sequenceRequest.onsuccess = () => {
      const stored = sequenceRequest.result as { key: string; value: number } | undefined;
      latestSequence = Number.isSafeInteger(stored?.value) ? stored!.value : 0;
      finishReads();
    };

    transaction.oncomplete = () => resolve({ deviceId, latestSequence });
    transaction.onerror = () => reject(transaction.error ?? new Error("Local database migration failed."));
    transaction.onabort = () => {
      if (transaction.error) reject(transaction.error);
    };
  });
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readAllRecords(db: IDBDatabase): Promise<Array<{ key: string; value: string }>> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, "readonly");
    const request = transaction.objectStore(RECORD_STORE).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as Array<{ key: string; value: string }>);
    request.onerror = () => reject(request.error ?? new Error("Unable to read the local database."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local database read failed."));
  });
}


function commitRecordOnly(db: IDBDatabase, mutation: OperationJournalMutation): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, "readwrite");
    applyMutation(transaction.objectStore(RECORD_STORE), mutation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local database record transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local database record transaction aborted."));
  });
}

function commitRecordAndJournal(db: IDBDatabase, entry: OperationJournalEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([RECORD_STORE, JOURNAL_STORE, META_STORE], "readwrite");
    const records = transaction.objectStore(RECORD_STORE);
    applyMutation(records, entry.mutation);
    transaction.objectStore(JOURNAL_STORE).add(entry);
    transaction.objectStore(META_STORE).put({ key: LATEST_SEQUENCE_KEY, value: entry.sequence });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local database journal transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local database journal transaction aborted."));
  });
}

function commitMutationBatch(
  db: IDBDatabase,
  mutations: readonly OperationJournalMutation[],
  journalEntries: readonly OperationJournalEntry[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [RECORD_STORE, JOURNAL_STORE, META_STORE],
      "readwrite",
    );
    const records = transaction.objectStore(RECORD_STORE);
    for (const mutation of mutations) applyMutation(records, mutation);
    const journal = transaction.objectStore(JOURNAL_STORE);
    for (const entry of journalEntries) journal.add(entry);
    const latest = journalEntries.at(-1);
    if (latest) {
      transaction.objectStore(META_STORE).put({
        key: LATEST_SEQUENCE_KEY,
        value: latest.sequence,
      });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error("Local database batch transaction failed."),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error("Local database batch transaction aborted."),
    );
  });
}

function applyMutation(store: IDBObjectStore, mutation: OperationJournalMutation): void {
  if (mutation.type === "key-value.set") {
    store.put({ key: mutation.key, value: mutation.value });
  } else {
    store.delete(mutation.key);
  }
}

function readJournalEntries(
  db: IDBDatabase,
  afterSequence: number,
  limit: number,
): Promise<OperationJournalEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: OperationJournalEntry[] = [];
    const transaction = db.transaction(JOURNAL_STORE, "readonly");
    const range = IDBKeyRange.lowerBound(afterSequence, true);
    const request = transaction.objectStore(JOURNAL_STORE).openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || entries.length >= limit) return;
      entries.push(cursor.value as OperationJournalEntry);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(entries);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to read the operation journal."));
  });
}

function readJournalStatistics(db: IDBDatabase): Promise<{ count: number; oldestSequence: number | null }> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(JOURNAL_STORE, "readonly");
    const store = transaction.objectStore(JOURNAL_STORE);
    const countRequest = store.count();
    const cursorRequest = store.openCursor();
    let oldestSequence: number | null = null;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) oldestSequence = (cursor.value as OperationJournalEntry).sequence;
    };
    transaction.oncomplete = () => resolve({ count: countRequest.result ?? 0, oldestSequence });
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to inspect the operation journal."));
  });
}

function readCheckpointStatistics(db: IDBDatabase): Promise<{ count: number; latestCheckpointId: string | null }> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHECKPOINT_STORE, META_STORE], "readonly");
    const countRequest = transaction.objectStore(CHECKPOINT_STORE).count();
    const latestRequest = transaction.objectStore(META_STORE).get(LATEST_CHECKPOINT_ID_KEY);
    transaction.oncomplete = () => resolve({
      count: countRequest.result ?? 0,
      latestCheckpointId: (latestRequest.result?.value as string | undefined) ?? null,
    });
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to inspect checkpoints."));
  });
}

function pruneJournalEntries(
  db: IDBDatabase,
  throughSequence: number,
  scope?: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let removed = 0;
    const transaction = db.transaction(JOURNAL_STORE, "readwrite");
    const request = transaction.objectStore(JOURNAL_STORE).openCursor(IDBKeyRange.upperBound(throughSequence));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const entry = cursor.value as OperationJournalEntry;
      if (shouldPruneJournalEntry(entry, throughSequence, scope)) {
        cursor.delete();
        removed += 1;
      }
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to prune the operation journal."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Operation journal pruning was aborted."));
  });
}

function replaceAllRecords(db: IDBDatabase, entries: Readonly<Record<string, string>>): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, "readwrite");
    const store = transaction.objectStore(RECORD_STORE);
    store.clear();
    for (const [key, value] of Object.entries(entries)) store.put({ key, value });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local database transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local database transaction aborted."));
  });
}


function writeCheckpoint(
  db: IDBDatabase,
  checkpoint: PersistenceCheckpoint,
  scope?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHECKPOINT_STORE, META_STORE], "readwrite");
    const checkpoints = transaction.objectStore(CHECKPOINT_STORE);
    checkpoints.put(checkpoint);
    transaction.objectStore(META_STORE).put({
      key: checkpointMetadataKey(scope),
      value: checkpoint.checkpointId,
    });

    const index = checkpoints.index("createdAt");
    let retained = 0;
    const cursorRequest = index.openCursor(null, "prev");
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      retained += 1;
      if (retained > MAX_RETAINED_CHECKPOINTS) cursor.delete();
      cursor.continue();
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to persist checkpoint."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Checkpoint transaction aborted."));
  });
}

function readLatestCheckpoint(
  db: IDBDatabase,
  scope?: string,
): Promise<PersistenceCheckpoint | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, CHECKPOINT_STORE], "readonly");
    const metadataRequest = transaction.objectStore(META_STORE).get(checkpointMetadataKey(scope));
    metadataRequest.onsuccess = () => {
      const id = (metadataRequest.result as { key: string; value: string } | undefined)?.value;
      if (!id) {
        resolve(null);
        return;
      }
      const checkpointRequest = transaction.objectStore(CHECKPOINT_STORE).get(id);
      checkpointRequest.onsuccess = () => resolve((checkpointRequest.result as PersistenceCheckpoint | undefined) ?? null);
      checkpointRequest.onerror = () => reject(checkpointRequest.error ?? new Error("Unable to read latest checkpoint."));
    };
    metadataRequest.onerror = () => reject(metadataRequest.error ?? new Error("Unable to read checkpoint metadata."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to read latest checkpoint."));
  });
}

function readCheckpoints(db: IDBDatabase, limit: number): Promise<PersistenceCheckpoint[]> {
  return new Promise((resolve, reject) => {
    const checkpoints: PersistenceCheckpoint[] = [];
    const transaction = db.transaction(CHECKPOINT_STORE, "readonly");
    const request = transaction.objectStore(CHECKPOINT_STORE).index("createdAt").openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || checkpoints.length >= limit) return;
      checkpoints.push(cursor.value as PersistenceCheckpoint);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(checkpoints);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to list checkpoints."));
  });
}

function restoreDatabaseFromCheckpoint(
  db: IDBDatabase,
  entries: Readonly<Record<string, string>>,
  restoredCheckpoint: PersistenceCheckpoint,
  scope?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const prefix = scope ? budgetPersistenceKeyPrefix(scope) : null;
    const transaction = db.transaction(
      [RECORD_STORE, JOURNAL_STORE, CHECKPOINT_STORE, CONFLICT_STORE, META_STORE],
      "readwrite",
    );
    const records = transaction.objectStore(RECORD_STORE);
    const cursorRequest = records.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        for (const [key, value] of Object.entries(entries)) records.put({ key, value });
        return;
      }
      const row = cursor.value as { key: string; value: string };
      if (
        isCanonicalBudgetStorageKey(row.key) &&
        (!prefix || row.key.startsWith(prefix))
      ) cursor.delete();
      cursor.continue();
    };

    const journal = transaction.objectStore(JOURNAL_STORE);
    if (!prefix) {
      journal.clear();
    } else {
      const journalCursor = journal.openCursor();
      journalCursor.onsuccess = () => {
        const cursor = journalCursor.result;
        if (!cursor) return;
        const entry = cursor.value as OperationJournalEntry;
        if (entry.mutation.key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
    }
    const conflicts = transaction.objectStore(CONFLICT_STORE);
    if (!prefix) {
      conflicts.clear();
    } else {
      const conflictCursor = conflicts.openCursor();
      conflictCursor.onsuccess = () => {
        const cursor = conflictCursor.result;
        if (!cursor) return;
        const conflict = cursor.value as ReplicationConflict;
        if (conflict.key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
    }
    transaction.objectStore(CHECKPOINT_STORE).put(restoredCheckpoint);
    const metadata = transaction.objectStore(META_STORE);
    if (!prefix) metadata.put({ key: LATEST_SEQUENCE_KEY, value: 0 });
    metadata.put({
      key: checkpointMetadataKey(scope),
      value: restoredCheckpoint.checkpointId,
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Checkpoint restore failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Checkpoint restore aborted."));
  });
}

function checkpointMetadataKey(scope?: string): string {
  return scope
    ? `${LATEST_CHECKPOINT_ID_KEY}.${encodeURIComponent(scope)}`
    : LATEST_CHECKPOINT_ID_KEY;
}

export function mergeScopedPersistenceEntries(
  existing: Readonly<Record<string, string>>,
  restored: Readonly<Record<string, string>>,
  scope: string,
): Record<string, string> {
  const prefix = budgetPersistenceKeyPrefix(scope);
  const merged = Object.fromEntries(
    Object.entries(existing).filter(([key]) => !key.startsWith(prefix)),
  );
  for (const [key, value] of Object.entries(restored)) {
    if (!key.startsWith(prefix)) {
      throw new Error(`Restored data contains a key outside budget ${scope}.`);
    }
    merged[key] = value;
  }
  return merged;
}

export function shouldPruneJournalEntry(
  entry: OperationJournalEntry,
  throughSequence: number,
  scope?: string,
): boolean {
  if (entry.sequence > throughSequence) return false;
  return !scope || entry.mutation.key.startsWith(budgetPersistenceKeyPrefix(scope));
}

function validateReplicationCursorState(state: ReplicationCursorState): void {
  if (state.generationId !== null && !state.generationId.trim()) {
    throw new Error("Replication generation IDs cannot be empty.");
  }
  for (const [name, value] of [
    ["pushedLocalSequence", state.pushedLocalSequence],
    ["pulledRemoteCursor", state.pulledRemoteCursor],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }
}

function readReplicationCursorState(
  db: IDBDatabase,
  scope?: string,
): Promise<ReplicationCursorState> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const store = transaction.objectStore(META_STORE);
    const values: Record<string, unknown> = {};
    const keys = replicationCursorKeys(scope);
    let remaining = keys.length;
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        values[key] = (request.result as { value?: unknown } | undefined)?.value;
        remaining -= 1;
        if (remaining === 0) {
          resolve({
            generationId:
              typeof values[keys[0]] === "string"
                ? (values[keys[0]] as string)
                : null,
            pushedLocalSequence: Number.isSafeInteger(values[keys[1]])
              ? (values[keys[1]] as number)
              : 0,
            pulledRemoteCursor: Number.isSafeInteger(values[keys[2]])
              ? (values[keys[2]] as number)
              : 0,
          });
        }
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to read replication state."));
    }
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to read replication state."));
  });
}

function writeReplicationCursorState(
  db: IDBDatabase,
  state: ReplicationCursorState,
  scope?: string,
): Promise<void> {
  validateReplicationCursorState(state);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    const keys = replicationCursorKeys(scope);
    if (state.generationId === null) store.delete(keys[0]);
    else store.put({ key: keys[0], value: state.generationId });
    store.put({ key: keys[1], value: state.pushedLocalSequence });
    store.put({ key: keys[2], value: state.pulledRemoteCursor });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to persist replication state."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Replication state transaction aborted."));
  });
}

function replicationCursorKeys(scope?: string): readonly [string, string, string] {
  const suffix = scope?.trim()
    ? `.${scope.trim().replace(/[^a-zA-Z0-9_-]/g, "_")}`
    : "";
  return [
    `${REPLICATION_GENERATION_KEY}${suffix}`,
    `${REPLICATION_PUSHED_SEQUENCE_KEY}${suffix}`,
    `${REPLICATION_PULLED_CURSOR_KEY}${suffix}`,
  ];
}


function resolveRemoteEntityOperations(
  operations: readonly RemoteOperationEnvelope[],
  currentRecords: ReadonlyMap<string, string>,
): RemoteOperationEnvelope[] {
  const simulated = new Map(currentRecords);
  return operations.map((envelope) => {
    const mutation = envelope.operation.mutation;
    if (mutation.type !== "key-value.set") {
      simulated.delete(mutation.key);
      return envelope;
    }
    const current = simulated.get(mutation.key);
    const merged = current === undefined
      ? null
      : mergeSerializedEntityRecords(current, mutation.value);
    const value = merged ?? mutation.value;
    simulated.set(mutation.key, value);
    return value === mutation.value
      ? envelope
      : {
          ...envelope,
          operation: {
            ...envelope.operation,
            mutation: { ...mutation, value },
          },
        };
  });
}

function mutationsAreMergeCompatibleEntities(
  left: OperationJournalMutation,
  right: OperationJournalMutation,
): boolean {
  return left.type === "key-value.set" &&
    right.type === "key-value.set" &&
    mergeSerializedEntityRecords(left.value, right.value) !== null;
}

function applyRemoteOperationsTransaction(
  db: IDBDatabase,
  operations: readonly RemoteOperationEnvelope[],
  conflicts: readonly ReplicationConflict[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([RECORD_STORE, CONFLICT_STORE], "readwrite");
    const store = transaction.objectStore(RECORD_STORE);
    for (const envelope of operations) applyMutation(store, envelope.operation.mutation);
    const conflictStore = transaction.objectStore(CONFLICT_STORE);
    for (const conflict of conflicts) conflictStore.put(conflict);
    transaction.oncomplete = () => resolve(operations.length);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to apply remote operations."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Remote operation transaction aborted."));
  });
}

function detectReplicationConflicts(
  remoteOperations: readonly RemoteOperationEnvelope[],
  context?: ReplicationApplyContext,
): ReplicationConflict[] {
  if (!context || context.localOperations.length === 0) return [];
  const conflicts = new Map<string, ReplicationConflict>();
  for (const remote of remoteOperations) {
    for (const local of context.localOperations) {
      if (remote.operation.deviceId === local.deviceId) continue;
      if (remote.operation.mutation.key !== local.mutation.key) continue;
      if (mutationsAreEquivalent(remote.operation.mutation, local.mutation)) continue;
      if (mutationsAreMergeCompatibleEntities(remote.operation.mutation, local.mutation)) continue;
      const conflictId = createConflictId({
        generationId: context.generationId,
        key: local.mutation.key,
        localOperationId: local.operationId,
        remoteOperationId: remote.operation.operationId,
      });
      conflicts.set(conflictId, {
        conflictId,
        generationId: context.generationId,
        key: local.mutation.key,
        detectedAt: new Date().toISOString(),
        localOperationId: local.operationId,
        localDeviceId: local.deviceId,
        localSequence: local.sequence,
        localMutation: local.mutation,
        remoteOperationId: remote.operation.operationId,
        remoteDeviceId: remote.operation.deviceId,
        remoteCursor: remote.cursor,
        remoteMutation: remote.operation.mutation,
        deterministicWinner: "remote",
        status: "unresolved",
        resolvedAt: null,
      });
    }
  }
  return [...conflicts.values()];
}

function readReplicationConflicts(
  db: IDBDatabase,
  status: ReplicationConflictStatus | undefined,
  limit: number,
): Promise<ReplicationConflict[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICT_STORE, "readonly");
    const store = transaction.objectStore(CONFLICT_STORE);
    const request = status ? store.index("status").openCursor(IDBKeyRange.only(status), "prev") : store.index("detectedAt").openCursor(null, "prev");
    const results: ReplicationConflict[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }
      results.push(cursor.value as ReplicationConflict);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to read replication conflicts."));
  });
}

function countUnresolvedConflicts(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICT_STORE, "readonly");
    const request = transaction.objectStore(CONFLICT_STORE).index("status").count(IDBKeyRange.only("unresolved"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to count replication conflicts."));
  });
}

function markConflictResolved(
  db: IDBDatabase,
  conflictId: string,
  resolution: "keep-local" | "accept-remote",
): Promise<ReplicationConflict | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFLICT_STORE, "readwrite");
    const store = transaction.objectStore(CONFLICT_STORE);
    let resolved: ReplicationConflict | null = null;
    const request = store.get(conflictId);
    request.onsuccess = () => {
      const current = request.result as ReplicationConflict | undefined;
      if (!current) return;
      resolved = {
        ...current,
        status: resolution === "keep-local" ? "resolved-local" : "resolved-remote",
        resolvedAt: new Date().toISOString(),
      };
      store.put(resolved);
    };
    transaction.oncomplete = () => resolve(resolved);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to resolve replication conflict."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Conflict resolution aborted."));
  });
}
