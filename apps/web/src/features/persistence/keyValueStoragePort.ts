export type KeyValueStorageMutation =
  | Readonly<{ type: "set"; key: string; value: string }>
  | Readonly<{ type: "remove"; key: string }>;

export interface KeyValueStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  listKeys?(): string[];
  flush?(): Promise<void>;
  applyMutations?(mutations: readonly KeyValueStorageMutation[]): Promise<void>;
}

const INDEXED_DB_NAME = "budget-app-browser-storage-v1";
const INDEXED_DB_STORE = "key-values";
const INDEXED_DB_POINTER_PREFIX = "__budget_app_indexed_db_value__:";
const LOCAL_STORAGE_POINTER_VALUE = `${INDEXED_DB_POINTER_PREFIX}v1`;

const indexedDbMirror = new Map<string, string>();
const pendingIndexedDbDeletes = new Set<string>();
let indexedDbHydrated = false;
let lifecycleFlushInstalled = false;

export interface SerializedWriteCoordinator {
  queue(operation: () => Promise<void>): void;
  flush(): Promise<void>;
}

export function createSerializedWriteCoordinator(): SerializedWriteCoordinator {
  let writeTail = Promise.resolve();
  let firstWriteError: unknown = null;

  return {
    queue(operation) {
      const write = writeTail.then(operation);
      writeTail = write.catch((error: unknown) => {
        firstWriteError ??= error;
      });
    },

    async flush() {
      await writeTail;

      if (firstWriteError !== null) {
        const error = firstWriteError;
        firstWriteError = null;
        throw error;
      }
    },
  };
}

const indexedDbWrites = createSerializedWriteCoordinator();

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function shouldUseIndexedDbForKey(key: string): boolean {
  return (
    key.startsWith("budget-app.budgets.") ||
    key.startsWith("budget-app.budget-view.v1.") ||
    key.startsWith("budget-app.ynab4-launcher-import.v1.")
  );
}

function openBudgetAppIndexedDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE, { keyPath: "key" });
      }
    };

    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB storage backend."));
    request.onsuccess = () => resolve(request.result);
  });
}

function readAllIndexedDbValues(): Promise<Map<string, string>> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(new Map());
  }

  return openBudgetAppIndexedDb().then((db) => new Promise<Map<string, string>>((resolve, reject) => {
    const transaction = db.transaction(INDEXED_DB_STORE, "readonly");
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error ?? new Error("Unable to read IndexedDB storage backend."));
    request.onsuccess = () => {
      const rows = (request.result ?? []) as Array<{ key: string; value: string }>;
      resolve(new Map(rows.map((row) => [row.key, row.value])));
    };

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed."));
  }));
}

function putIndexedDbValue(key: string, value: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  return openBudgetAppIndexedDb().then((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(INDEXED_DB_STORE, "readwrite");
    transaction.objectStore(INDEXED_DB_STORE).put({ key, value });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB write transaction failed."));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB write transaction aborted."));
    };
  }));
}

function deleteIndexedDbValue(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve();
  }

  return openBudgetAppIndexedDb().then((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(INDEXED_DB_STORE, "readwrite");
    transaction.objectStore(INDEXED_DB_STORE).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB delete transaction failed."));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB delete transaction aborted."));
    };
  }));
}

function removeDanglingIndexedDbPointers(): void {
  if (!canUseBrowserStorage()) {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (!key) {
      continue;
    }

    const value = window.localStorage.getItem(key);
    if (
      value?.startsWith(INDEXED_DB_POINTER_PREFIX) &&
      !indexedDbMirror.has(key)
    ) {
      window.localStorage.removeItem(key);
    }
  }
}

export async function hydrateBrowserStorageBackend(): Promise<void> {
  if (indexedDbHydrated) return;
  const values = await readAllIndexedDbValues();
  indexedDbMirror.clear();
  for (const [key, value] of values) {
    indexedDbMirror.set(key, value);
  }
  removeDanglingIndexedDbPointers();
  indexedDbHydrated = true;
}

export async function flushBrowserStorageBackend(): Promise<void> {
  await indexedDbWrites.flush();
}

export function installBrowserStorageLifecycleFlush(): () => void {
  if (
    lifecycleFlushInstalled ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return () => undefined;
  }

  lifecycleFlushInstalled = true;

  const flushPendingWrites = () => {
    void flushBrowserStorageBackend().catch((error: unknown) => {
      console.error("Unable to flush browser storage writes.", error);
    });
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushPendingWrites();
    }
  };

  window.addEventListener("pagehide", flushPendingWrites);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("pagehide", flushPendingWrites);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    lifecycleFlushInstalled = false;
  };
}

export const browserLocalStorageKeyValueStorage: KeyValueStoragePort = {
  getItem(key: string): string | null {
    if (pendingIndexedDbDeletes.has(key)) {
      return null;
    }

    if (indexedDbMirror.has(key)) {
      return indexedDbMirror.get(key) ?? null;
    }

    if (!canUseBrowserStorage()) {
      return null;
    }

    const value = window.localStorage.getItem(key);
    if (value?.startsWith(INDEXED_DB_POINTER_PREFIX)) {
      return indexedDbMirror.get(key) ?? null;
    }

    return value;
  },

  setItem(key: string, value: string): void {
    if (!canUseBrowserStorage()) {
      return;
    }

    if (shouldUseIndexedDbForKey(key)) {
      pendingIndexedDbDeletes.delete(key);
      indexedDbMirror.set(key, value);
      indexedDbWrites.queue(async () => {
        await putIndexedDbValue(key, value);
        window.localStorage.setItem(key, LOCAL_STORAGE_POINTER_VALUE);
      });
      return;
    }

    window.localStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    indexedDbMirror.delete(key);
    pendingIndexedDbDeletes.add(key);

    indexedDbWrites.queue(async () => {
      await deleteIndexedDbValue(key);

      if (pendingIndexedDbDeletes.has(key)) {
        if (canUseBrowserStorage()) {
          window.localStorage.removeItem(key);
        }
        pendingIndexedDbDeletes.delete(key);
      }
    });
  },

  listKeys(): string[] {
    const keys = new Set<string>(indexedDbMirror.keys());

    if (canUseBrowserStorage()) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key) keys.add(key);
      }
    }

    for (const key of pendingIndexedDbDeletes) {
      keys.delete(key);
    }

    return [...keys].sort();
  },

  async flush(): Promise<void> {
    await flushBrowserStorageBackend();
  },
};
