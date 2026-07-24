import type { KeyValueStoragePort } from "./keyValueStoragePort";
import { createSerializedWriteCoordinator } from "./keyValueStoragePort";
import {
  createOperationJournalEntry,
  type OperationJournalCursor,
  type OperationJournalEntry,
  type OperationJournalMutation,
} from "./operationJournal";

const DATABASE_NAME = "budget-app-local-database-v1";
const DATABASE_VERSION = 2;
const RECORD_STORE = "records";
const META_STORE = "metadata";
const JOURNAL_STORE = "operation-journal";
const SCHEMA_VERSION_KEY = "schema-version";
const DEVICE_ID_KEY = "device-id";
const LATEST_SEQUENCE_KEY = "operation-journal.latest-sequence";
const CURRENT_SCHEMA_VERSION = 2;

export interface LocalDatabaseKeyValueStorage extends KeyValueStoragePort {
  initialize(): Promise<void>;
  isEmpty(): boolean;
  replaceAll(entries: Readonly<Record<string, string>>): Promise<void>;
  flush(): Promise<void>;
  getJournalCursor(): OperationJournalCursor;
  readJournal(afterSequence?: number, limit?: number): Promise<OperationJournalEntry[]>;
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
  };

  async function commitMutation(entry: OperationJournalEntry): Promise<void> {
    const db = await openDatabase();
    try {
      await commitRecordAndJournal(db, entry);
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
