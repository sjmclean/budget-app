import type { KeyValueStoragePort } from "./keyValueStoragePort";
import {
  createSharedServerStorageClient,
  SharedServerStorageConflictError,
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
  const changeListeners = new Set<SharedServerStorageChangeListener>();

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

  function notifyChangeListeners(): void {
    for (const listener of changeListeners) {
      listener();
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
      try {
        const result = await client.applyOperations(operations, revision);
        revision = result.revision;
      } catch (error) {
        if (error instanceof SharedServerStorageConflictError) {
          const snapshot = await client.loadSnapshot();
          replaceMirror(snapshot.entries);
          revision = snapshot.revision;
          notifyChangeListeners();
        } else {
          pendingOperations = [...operations, ...pendingOperations];
        }

        throw error;
      }
    });

    writeTail = write.catch((error: unknown) => {
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

  async function performRefreshForRevision(
    announcedRevision: number,
  ): Promise<boolean> {
    requireInitialized();
    await flushPendingWrites();
    if (announcedRevision === revision) {
      return false;
    }

    return loadLatestSnapshot();
  }

  function queueRefreshForRevision(
    announcedRevision: number,
  ): Promise<boolean> {
    const refresh = refreshTail.then(() =>
      performRefreshForRevision(announcedRevision)
    );
    refreshTail = refresh.catch(() => false);
    return refresh;
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
      changeListeners.add(listener);

      let stopped = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let stopRevisionSubscription: (() => void) | null = null;

      const handleChangedRevision = async (announcedRevision: number) => {
        try {
          if (await queueRefreshForRevision(announcedRevision)) {
            notifyChangeListeners();
          }
        } catch (error) {
          console.error(
            "Unable to refresh the shared budget after a server event.",
            error,
          );
        }
      };

      const subscribeToServerEvents = () => {
        if (!client.subscribeToRevisions) {
          return false;
        }

        try {
          stopRevisionSubscription = client.subscribeToRevisions(
            ({ revision: announcedRevision }) => {
              if (!stopped) {
                void handleChangedRevision(announcedRevision);
              }
            },
            (error) => {
              console.error(
                "Shared budget live-update connection reported an error.",
                error,
              );
            },
          );
          return stopRevisionSubscription !== null;
        } catch (error) {
          console.error(
            "Unable to open the shared budget live-update connection; falling back to polling.",
            error,
          );
          return false;
        }
      };

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
            notifyChangeListeners();
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

      // EventSource reconnects automatically after transient network failures.
      // Polling remains as a compatibility fallback for environments without
      // Server-Sent Events, including older embedded browsers and test clients.
      if (!subscribeToServerEvents()) {
        void checkForChanges();
      }

      return () => {
        stopped = true;
        changeListeners.delete(listener);
        stopRevisionSubscription?.();
        stopRevisionSubscription = null;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
    },
  };
}
