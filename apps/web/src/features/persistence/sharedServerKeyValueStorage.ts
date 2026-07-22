import type { KeyValueStoragePort } from "./keyValueStoragePort";
import {
  createSharedServerStorageClient,
  type SharedServerStorageClient,
  type SharedServerStorageClientOptions,
  type SharedServerStorageOperation,
} from "./sharedServerStorageClient";

export type SharedServerStorageChangeListener = () => void;

export interface SharedServerKeyValueStorage extends KeyValueStoragePort {
  initialize(): Promise<void>;
  flush(): Promise<void>;
  getRevision(): number;
  isInitialized(): boolean;
  refreshIfChanged(): Promise<boolean>;
  watch(listener: SharedServerStorageChangeListener): () => void;
}

export interface SharedServerKeyValueStorageOptions
  extends SharedServerStorageClientOptions {
  client?: SharedServerStorageClient;
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MAX_REFRESH_ATTEMPTS = 3;

export function createSharedServerKeyValueStorage(
  options: SharedServerKeyValueStorageOptions = {},
): SharedServerKeyValueStorage {
  const client = options.client ?? createSharedServerStorageClient(options);
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const mirror = new Map<string, string>();
  let revision = 0;
  let initialized = false;
  let pendingOperations: SharedServerStorageOperation[] = [];
  let writeTail: Promise<void> = Promise.resolve();
  let firstWriteError: unknown = null;
  let automaticFlushScheduled = false;
  let mutationVersion = 0;
  let refreshTail: Promise<boolean> = Promise.resolve(false);

  function requireInitialized(): void {
    if (!initialized) {
      throw new Error(
        "Shared server storage must be initialized before it can be changed.",
      );
    }
  }

  function replaceMirror(entries: Readonly<Record<string, string>>): void {
    mirror.clear();
    for (const [key, value] of Object.entries(entries)) {
      mirror.set(key, value);
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

  async function flushPendingWrites(): Promise<void> {
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
  }

  async function loadLatestSnapshot(): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
      await flushPendingWrites();
      const mutationVersionBeforeLoad = mutationVersion;
      const snapshot = await client.loadSnapshot();

      // A local write occurred while the snapshot request was in flight. Flush
      // it and retry so the mirror is never replaced with a snapshot that
      // predates a local mutation.
      if (mutationVersion !== mutationVersionBeforeLoad) {
        continue;
      }

      const changed = snapshot.revision !== revision;
      replaceMirror(snapshot.entries);
      revision = snapshot.revision;
      return changed;
    }

    return false;
  }

  async function performRefreshIfChanged(): Promise<boolean> {
    requireInitialized();
    await flushPendingWrites();

    const health = await client.getHealth();
    if (health.revision === revision) {
      return false;
    }

    return loadLatestSnapshot();
  }


  function queueRefreshIfChanged(): Promise<boolean> {
    const refresh = refreshTail.then(performRefreshIfChanged);
    refreshTail = refresh.catch(() => false);
    return refresh;
  }

  return {
    async initialize(): Promise<void> {
      if (initialized) {
        return;
      }

      const snapshot = await client.loadSnapshot();
      replaceMirror(snapshot.entries);
      revision = snapshot.revision;
      initialized = true;
    },

    getItem(key: string): string | null {
      return mirror.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      requireInitialized();
      mirror.set(key, value);
      mutationVersion += 1;
      pendingOperations.push({ type: "set", key, value });
      scheduleAutomaticFlush();
    },

    removeItem(key: string): void {
      requireInitialized();
      mirror.delete(key);
      mutationVersion += 1;
      pendingOperations.push({ type: "remove", key });
      scheduleAutomaticFlush();
    },

    listKeys(): string[] {
      return [...mirror.keys()].sort();
    },

    flush: flushPendingWrites,

    getRevision(): number {
      return revision;
    },

    isInitialized(): boolean {
      return initialized;
    },

    refreshIfChanged: queueRefreshIfChanged,

    watch(listener: SharedServerStorageChangeListener): () => void {
      requireInitialized();

      let stopped = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const scheduleNextCheck = () => {
        if (stopped) {
          return;
        }

        timeoutId = setTimeout(() => {
          void checkForChanges();
        }, pollIntervalMs);
      };

      const checkForChanges = async () => {
        try {
          if (await queueRefreshIfChanged()) {
            listener();
          }
        } catch (error) {
          console.error(
            "Unable to check the shared budget server for updates.",
            error,
          );
        } finally {
          scheduleNextCheck();
        }
      };

      // Check immediately when watching starts. The lifecycle helper restarts
      // watching when a hidden tab becomes visible, providing an immediate
      // catch-up check without waiting for the next polling interval.
      void checkForChanges();

      return () => {
        stopped = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
    },
  };
}
