import type { KeyValueStoragePort } from "./keyValueStoragePort";
import { createSerializedWriteCoordinator } from "./keyValueStoragePort";

const DATABASE_NAME = "budget-app-local-database-v1";
const DATABASE_VERSION = 1;
const RECORD_STORE = "records";
const META_STORE = "metadata";
const SCHEMA_VERSION_KEY = "schema-version";
const CURRENT_SCHEMA_VERSION = 1;

export interface LocalDatabaseKeyValueStorage extends KeyValueStoragePort {
  initialize(): Promise<void>;
  isEmpty(): boolean;
  replaceAll(entries: Readonly<Record<string, string>>): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Browser-local authoritative database boundary.
 *
 * IndexedDB is used here as the browser runtime's durable database engine. The
 * domain-facing contract is intentionally engine-neutral so a desktop host can
 * install the existing SQLite-backed provider through the host gateway without
 * changing feature code. All reads are synchronous after initialize() hydrates
 * the in-memory mirror; writes are durably serialized through one coordinator.
 */
export function createLocalDatabaseKeyValueStorage(): LocalDatabaseKeyValueStorage {
  const mirror = new Map<string, string>();
  const writes = createSerializedWriteCoordinator();
  let initialized = false;

  return {
    async initialize(): Promise<void> {
      if (initialized) return;
      const db = await openDatabase();

      try {
        await ensureSchemaVersion(db);
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
      writes.queue(async () => {
        const db = await openDatabase();
        try {
          await putRecord(db, key, value);
        } finally {
          db.close();
        }
      });
    },

    removeItem(key: string): void {
      assertInitialized(initialized);
      mirror.delete(key);
      writes.queue(async () => {
        const db = await openDatabase();
        try {
          await deleteRecord(db, key);
        } finally {
          db.close();
        }
      });
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
  };
}

function assertInitialized(initialized: boolean): void {
  if (!initialized) {
    throw new Error(
      "The local database was accessed before initialize() completed.",
    );
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is unavailable; the local database cannot start."),
    );
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
    };

    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open the local database."));
    request.onsuccess = () => resolve(request.result);
  });
}

function ensureSchemaVersion(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    const request = store.get(SCHEMA_VERSION_KEY);

    request.onsuccess = () => {
      const stored = request.result as { key: string; value: number } | undefined;
      if (stored && stored.value > CURRENT_SCHEMA_VERSION) {
        transaction.abort();
        reject(
          new Error(
            `Local database schema ${stored.value} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`,
          ),
        );
        return;
      }

      store.put({ key: SCHEMA_VERSION_KEY, value: CURRENT_SCHEMA_VERSION });
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to read local database metadata."));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Local database migration failed."));
    transaction.onabort = () => {
      if (!transaction.error) return;
      reject(transaction.error);
    };
  });
}

function readAllRecords(
  db: IDBDatabase,
): Promise<Array<{ key: string; value: string }>> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, "readonly");
    const request = transaction.objectStore(RECORD_STORE).getAll();
    request.onsuccess = () =>
      resolve((request.result ?? []) as Array<{ key: string; value: string }>);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to read the local database."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Local database read failed."));
  });
}

function putRecord(db: IDBDatabase, key: string, value: string): Promise<void> {
  return completeTransaction(db, "readwrite", (store) => {
    store.put({ key, value });
  });
}

function deleteRecord(db: IDBDatabase, key: string): Promise<void> {
  return completeTransaction(db, "readwrite", (store) => {
    store.delete(key);
  });
}

function replaceAllRecords(
  db: IDBDatabase,
  entries: Readonly<Record<string, string>>,
): Promise<void> {
  return completeTransaction(db, "readwrite", (store) => {
    store.clear();
    for (const [key, value] of Object.entries(entries)) {
      store.put({ key, value });
    }
  });
}

function completeTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, mode);
    operation(transaction.objectStore(RECORD_STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Local database transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Local database transaction aborted."));
  });
}
