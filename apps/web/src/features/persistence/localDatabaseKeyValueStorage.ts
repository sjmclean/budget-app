import {
  applyOperationsToCheckpointEntries,
  assertCompatibleCheckpoint,
  checkpointMetadata,
  createPersistenceCheckpoint,
  type CheckpointPort,
  type CheckpointRestoreResult,
  type PersistenceCheckpoint,
  type PersistenceCheckpointMetadata,
} from "./checkpoint";
import { isCanonicalBudgetStorageKey } from "./persistenceSnapshot";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import { createSerializedWriteCoordinator } from "./keyValueStoragePort";
import {
  createOperationJournalEntry,
  type OperationJournalCursor,
  type OperationJournalEntry,
  type OperationJournalMutation,
} from "./operationJournal";
import type {
  RemoteOperationEnvelope,
  ReplicationCursorState,
  ReplicationDiagnostics,
  ReplicationLocalStorePort,
} from "./replication";

const DATABASE_NAME = "budget-app-local-database-v1";
const DATABASE_VERSION = 3;
const RECORD_STORE = "records";
const META_STORE = "metadata";
const JOURNAL_STORE = "operation-journal";
const CHECKPOINT_STORE = "checkpoints";
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
  createCheckpoint(): Promise<PersistenceCheckpoint>;
  getLatestCheckpoint(): Promise<PersistenceCheckpoint | null>;
  listCheckpoints(limit?: number): Promise<PersistenceCheckpointMetadata[]>;
  restoreCheckpoint(
    checkpoint: PersistenceCheckpoint,
    laterOperations?: readonly OperationJournalEntry[],
  ): Promise<CheckpointRestoreResult>;
  getReplicationDiagnostics(): Promise<ReplicationDiagnostics>;
  pruneJournal(throughSequence: number): Promise<number>;
}

/**
 * Browser-local authoritative database boundary.
 *
 * IndexedDB is used here as the browser runtime's durable database engine. Each
 * mutation and its journal entry are committed in one IndexedDB transaction,
 * so durable state and future sync history cannot diverge.
 */
export function createLocalDatabaseKeyValueStorage(): LocalDatabaseKeyValueStorage {
  const mirror = new Map<string, string>();
  const writes = createSerializedWriteCoordinator();
  let initialized = false;
  let deviceId = "";
  let latestSequence = 0;

  return {
    async initialize(): Promise<void> {
      if (initialized) return;
      const db = await openDatabase();

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
      const sequence = ++latestSequence;
      const entry = createOperationJournalEntry({
        deviceId,
        sequence,
        mutation: { type: "key-value.set", key, value },
      });
      writes.queue(() => commitMutation(entry));
    },

    removeItem(key: string): void {
      assertInitialized(initialized);
      mirror.delete(key);
      const sequence = ++latestSequence;
      const entry = createOperationJournalEntry({
        deviceId,
        sequence,
        mutation: { type: "key-value.remove", key },
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

    isEmpty(): boolean {
      assertInitialized(initialized);
      return mirror.size === 0;
    },

    async replaceAll(entries: Readonly<Record<string, string>>): Promise<void> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase();
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
      const db = await openDatabase();
      try {
        return await readJournalEntries(db, afterSequence, limit);
      } finally {
        db.close();
      }
    },

    async createCheckpoint(): Promise<PersistenceCheckpoint> {
      assertInitialized(initialized);
      const capturedEntries = Object.fromEntries(
        [...mirror.entries()].filter(([key]) => isCanonicalBudgetStorageKey(key)),
      );
      const capturedSequence = latestSequence;
      const checkpoint = createPersistenceCheckpoint({
        deviceId,
        throughSequence: capturedSequence,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        entries: capturedEntries,
      });
      writes.queue(() => persistCheckpoint(checkpoint));
      await writes.flush();
      return checkpoint;
    },

    async getLatestCheckpoint(): Promise<PersistenceCheckpoint | null> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase();
      try {
        return await readLatestCheckpoint(db);
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
      const db = await openDatabase();
      try {
        const checkpoints = await readCheckpoints(db, limit);
        return checkpoints.map(checkpointMetadata);
      } finally {
        db.close();
      }
    },

    async getReplicationCursorState(): Promise<ReplicationCursorState> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase();
      try {
        return await readReplicationCursorState(db);
      } finally {
        db.close();
      }
    },

    async setReplicationCursorState(state: ReplicationCursorState): Promise<void> {
      assertInitialized(initialized);
      validateReplicationCursorState(state);
      writes.queue(async () => {
        const db = await openDatabase();
        try {
          await writeReplicationCursorState(db, state);
        } finally {
          db.close();
        }
      });
      await writes.flush();
    },

    async getReplicationDiagnostics(): Promise<ReplicationDiagnostics> {
      assertInitialized(initialized);
      await writes.flush();
      const db = await openDatabase();
      try {
        const [journal, checkpoints, cursor] = await Promise.all([
          readJournalStatistics(db),
          readCheckpointStatistics(db),
          readReplicationCursorState(db),
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
        };
      } finally {
        db.close();
      }
    },

    async pruneJournal(throughSequence: number): Promise<number> {
      assertInitialized(initialized);
      if (!Number.isSafeInteger(throughSequence) || throughSequence < 0) {
        throw new Error("Journal pruning boundaries must be non-negative integers.");
      }
      await writes.flush();
      const db = await openDatabase();
      try {
        return await pruneJournalEntries(db, throughSequence);
      } finally {
        db.close();
      }
    },

    async applyRemoteOperations(
      operations: readonly RemoteOperationEnvelope[],
    ): Promise<number> {
      assertInitialized(initialized);
      if (operations.length === 0) return 0;
      await writes.flush();
      const sorted = [...operations].sort((left, right) => left.cursor - right.cursor);
      const db = await openDatabase();
      try {
        const applied = await applyRemoteOperationsTransaction(db, sorted);
        for (const envelope of sorted) {
          const mutation = envelope.operation.mutation;
          if (mutation.type === "key-value.set") mirror.set(mutation.key, mutation.value);
          else mirror.delete(mutation.key);
        }
        return applied;
      } finally {
        db.close();
      }
    },

    async restoreCheckpoint(
      checkpoint: PersistenceCheckpoint,
      laterOperations: readonly OperationJournalEntry[] = [],
    ): Promise<CheckpointRestoreResult> {
      assertInitialized(initialized);
      assertCompatibleCheckpoint(checkpoint, CURRENT_SCHEMA_VERSION);
      const restoredEntries = applyOperationsToCheckpointEntries(checkpoint, laterOperations);
      const restoredCheckpoint = createPersistenceCheckpoint({
        deviceId,
        throughSequence: 0,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        entries: restoredEntries,
      });

      await writes.flush();
      const db = await openDatabase();
      try {
        await restoreDatabaseFromCheckpoint(db, restoredEntries, restoredCheckpoint);
        for (const key of [...mirror.keys()]) {
          if (isCanonicalBudgetStorageKey(key)) mirror.delete(key);
        }
        for (const [key, value] of Object.entries(restoredEntries)) mirror.set(key, value);
        latestSequence = 0;
      } finally {
        db.close();
      }

      return {
        restoredCheckpointId: restoredCheckpoint.checkpointId,
        appliedOperationCount: new Set(laterOperations.map((entry) => entry.operationId)).size,
        entryCount: restoredCheckpoint.entryCount,
      };
    },
  };

  async function commitMutation(entry: OperationJournalEntry): Promise<void> {
    const db = await openDatabase();
    try {
      await commitRecordAndJournal(db, entry);
    } finally {
      db.close();
    }
  }

  async function persistCheckpoint(checkpoint: PersistenceCheckpoint): Promise<void> {
    const db = await openDatabase();
    try {
      await writeCheckpoint(db, checkpoint);
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

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable; the local database cannot start."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

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

function pruneJournalEntries(db: IDBDatabase, throughSequence: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let removed = 0;
    const transaction = db.transaction(JOURNAL_STORE, "readwrite");
    const request = transaction.objectStore(JOURNAL_STORE).openCursor(IDBKeyRange.upperBound(throughSequence));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      removed += 1;
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


function writeCheckpoint(db: IDBDatabase, checkpoint: PersistenceCheckpoint): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CHECKPOINT_STORE, META_STORE], "readwrite");
    const checkpoints = transaction.objectStore(CHECKPOINT_STORE);
    checkpoints.put(checkpoint);
    transaction.objectStore(META_STORE).put({ key: LATEST_CHECKPOINT_ID_KEY, value: checkpoint.checkpointId });

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

function readLatestCheckpoint(db: IDBDatabase): Promise<PersistenceCheckpoint | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, CHECKPOINT_STORE], "readonly");
    const metadataRequest = transaction.objectStore(META_STORE).get(LATEST_CHECKPOINT_ID_KEY);
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [RECORD_STORE, JOURNAL_STORE, CHECKPOINT_STORE, META_STORE],
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
      if (isCanonicalBudgetStorageKey(row.key)) cursor.delete();
      cursor.continue();
    };

    transaction.objectStore(JOURNAL_STORE).clear();
    transaction.objectStore(CHECKPOINT_STORE).put(restoredCheckpoint);
    const metadata = transaction.objectStore(META_STORE);
    metadata.put({ key: LATEST_SEQUENCE_KEY, value: 0 });
    metadata.put({ key: LATEST_CHECKPOINT_ID_KEY, value: restoredCheckpoint.checkpointId });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Checkpoint restore failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Checkpoint restore aborted."));
  });
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

function readReplicationCursorState(db: IDBDatabase): Promise<ReplicationCursorState> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const store = transaction.objectStore(META_STORE);
    const values: Record<string, unknown> = {};
    const keys = [
      REPLICATION_GENERATION_KEY,
      REPLICATION_PUSHED_SEQUENCE_KEY,
      REPLICATION_PULLED_CURSOR_KEY,
    ];
    let remaining = keys.length;
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        values[key] = (request.result as { value?: unknown } | undefined)?.value;
        remaining -= 1;
        if (remaining === 0) {
          resolve({
            generationId:
              typeof values[REPLICATION_GENERATION_KEY] === "string"
                ? (values[REPLICATION_GENERATION_KEY] as string)
                : null,
            pushedLocalSequence: Number.isSafeInteger(values[REPLICATION_PUSHED_SEQUENCE_KEY])
              ? (values[REPLICATION_PUSHED_SEQUENCE_KEY] as number)
              : 0,
            pulledRemoteCursor: Number.isSafeInteger(values[REPLICATION_PULLED_CURSOR_KEY])
              ? (values[REPLICATION_PULLED_CURSOR_KEY] as number)
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
): Promise<void> {
  validateReplicationCursorState(state);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    if (state.generationId === null) store.delete(REPLICATION_GENERATION_KEY);
    else store.put({ key: REPLICATION_GENERATION_KEY, value: state.generationId });
    store.put({ key: REPLICATION_PUSHED_SEQUENCE_KEY, value: state.pushedLocalSequence });
    store.put({ key: REPLICATION_PULLED_CURSOR_KEY, value: state.pulledRemoteCursor });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to persist replication state."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Replication state transaction aborted."));
  });
}

function applyRemoteOperationsTransaction(
  db: IDBDatabase,
  operations: readonly RemoteOperationEnvelope[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, "readwrite");
    const store = transaction.objectStore(RECORD_STORE);
    for (const envelope of operations) applyMutation(store, envelope.operation.mutation);
    transaction.oncomplete = () => resolve(operations.length);
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to apply remote operations."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Remote operation transaction aborted."));
  });
}
