import type { KeyValueStoragePort } from "./keyValueStoragePort";
import {
  createSharedServerStorageClient,
  type SharedServerStorageClient,
  type SharedServerStorageClientOptions,
  type SharedServerStorageOperation,
} from "./sharedServerStorageClient";

export interface SharedServerKeyValueStorage extends KeyValueStoragePort {
  initialize(): Promise<void>;
  getRevision(): number;
  isInitialized(): boolean;
}

export interface SharedServerKeyValueStorageOptions
  extends SharedServerStorageClientOptions {
  client?: SharedServerStorageClient;
}

export function createSharedServerKeyValueStorage(
  options: SharedServerKeyValueStorageOptions = {},
): SharedServerKeyValueStorage {
  const client = options.client ?? createSharedServerStorageClient(options);
  const mirror = new Map<string, string>();
  let revision = 0;
  let initialized = false;
  let pendingOperations: SharedServerStorageOperation[] = [];
  let writeTail: Promise<void> = Promise.resolve();
  let firstWriteError: unknown = null;
  let automaticFlushScheduled = false;

  function requireInitialized(): void {
    if (!initialized) {
      throw new Error(
        "Shared server storage must be initialized before it can be changed.",
      );
    }
  }

  function scheduleAutomaticFlush(): void {
    if (automaticFlushScheduled) {
      return;
    }

    automaticFlushScheduled = true;
    queueMicrotask(() => {
      automaticFlushScheduled = false;
      enqueuePendingOperations();
    });
  }

  function enqueuePendingOperations(): void {
    if (pendingOperations.length === 0) {
      return;
    }

    const operations = pendingOperations;
    pendingOperations = [];

    const write = writeTail.then(async () => {
      const result = await client.applyOperations(operations);
      revision = result.revision;
    });

    writeTail = write.catch((error: unknown) => {
      pendingOperations = [...operations, ...pendingOperations];
      firstWriteError ??= error;
    });
  }

  return {
    async initialize(): Promise<void> {
      if (initialized) {
        return;
      }

      const snapshot = await client.loadSnapshot();
      mirror.clear();
      for (const [key, value] of Object.entries(snapshot.entries)) {
        mirror.set(key, value);
      }
      revision = snapshot.revision;
      initialized = true;
    },

    getItem(key: string): string | null {
      return mirror.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      requireInitialized();
      mirror.set(key, value);
      pendingOperations.push({ type: "set", key, value });
      scheduleAutomaticFlush();
    },

    removeItem(key: string): void {
      requireInitialized();
      mirror.delete(key);
      pendingOperations.push({ type: "remove", key });
      scheduleAutomaticFlush();
    },

    listKeys(): string[] {
      return [...mirror.keys()].sort();
    },

    async flush(): Promise<void> {
      // Capture queued mutations synchronously. Otherwise an explicitly requested
      // flush can resume before the automatic microtask has extended writeTail.
      enqueuePendingOperations();
      await writeTail;

      if (firstWriteError !== null) {
        const error = firstWriteError;
        firstWriteError = null;
        throw error;
      }

      while (pendingOperations.length > 0) {
        enqueuePendingOperations();
        await writeTail;

        if (firstWriteError !== null) {
          const error = firstWriteError;
          firstWriteError = null;
          throw error;
        }
      }
    },

    getRevision(): number {
      return revision;
    },

    isInitialized(): boolean {
      return initialized;
    },
  };
}
