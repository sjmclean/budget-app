import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import {
  getPersistenceRevisionForInterest,
  subscribeToPersistenceInterest,
  type PersistenceChangeInterest,
} from "./persistenceChangeBus";

export const MAX_REACTIVE_QUERY_CACHE_ENTRIES = 256;

export type ReactiveQueryStatus =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "error";

export interface ReactiveQuerySnapshot<T> {
  readonly data: T | undefined;
  readonly status: ReactiveQueryStatus;
  readonly error: string | null;
  readonly dataRevision: number;
}

export interface ReactiveQueryDefinition<Input, Result> {
  readonly id: string;
  key(input: Input): string;
  interest(input: Input): PersistenceChangeInterest;
  load(provider: BudgetPersistenceProvider, input: Input): Promise<Result>;
}

interface ReactiveQueryEntry<T> {
  readonly cacheKey: string;
  interest: PersistenceChangeInterest;
  load: () => Promise<T>;
  snapshot: ReactiveQuerySnapshot<T>;
  inFlight: Promise<void> | null;
  attemptedRevision: number;
  generation: number;
  listeners: Set<() => void>;
  unsubscribePersistence: (() => void) | null;
  lastAccess: number;
}

interface QueryHandle<T> {
  readonly cacheKey: string;
  readonly interest: PersistenceChangeInterest;
  readonly load: () => Promise<T>;
}

const entries = new Map<string, ReactiveQueryEntry<unknown>>();
let accessSequence = 0;

const DISABLED_SNAPSHOT: ReactiveQuerySnapshot<never> = {
  data: undefined,
  status: "idle",
  error: null,
  dataRevision: 0,
};

function touch(entry: ReactiveQueryEntry<unknown>): void {
  accessSequence += 1;
  entry.lastAccess = accessSequence;
}

function notify(entry: ReactiveQueryEntry<unknown>): void {
  for (const listener of entry.listeners) listener();
}

function evictInactiveEntries(): void {
  if (entries.size <= MAX_REACTIVE_QUERY_CACHE_ENTRIES) return;
  const candidates = [...entries.values()]
    .filter((entry) => entry.listeners.size === 0)
    .sort((left, right) => left.lastAccess - right.lastAccess);

  for (const entry of candidates) {
    if (entries.size <= MAX_REACTIVE_QUERY_CACHE_ENTRIES) break;
    entry.generation += 1;
    entry.unsubscribePersistence?.();
    entry.unsubscribePersistence = null;
    entries.delete(entry.cacheKey);
  }
}

function getOrCreateEntry<T>(handle: QueryHandle<T>): ReactiveQueryEntry<T> {
  const existing = entries.get(handle.cacheKey) as ReactiveQueryEntry<T> | undefined;
  if (existing) {
    existing.interest = handle.interest;
    existing.load = handle.load;
    touch(existing as ReactiveQueryEntry<unknown>);
    return existing;
  }

  const entry: ReactiveQueryEntry<T> = {
    cacheKey: handle.cacheKey,
    interest: handle.interest,
    load: handle.load,
    snapshot: {
      data: undefined,
      status: "idle",
      error: null,
      dataRevision: 0,
    },
    inFlight: null,
    attemptedRevision: -1,
    generation: 0,
    listeners: new Set(),
    unsubscribePersistence: null,
    lastAccess: 0,
  };
  touch(entry as ReactiveQueryEntry<unknown>);
  entries.set(handle.cacheKey, entry as ReactiveQueryEntry<unknown>);
  evictInactiveEntries();
  return entry;
}

function setSnapshot<T>(
  entry: ReactiveQueryEntry<T>,
  snapshot: ReactiveQuerySnapshot<T>,
): void {
  entry.snapshot = snapshot;
  touch(entry as ReactiveQueryEntry<unknown>);
  notify(entry as ReactiveQueryEntry<unknown>);
}

function ensureFresh<T>(entry: ReactiveQueryEntry<T>): Promise<void> {
  const currentRevision = getPersistenceRevisionForInterest(entry.interest);
  if (
    entry.snapshot.data !== undefined &&
    entry.snapshot.dataRevision >= currentRevision
  ) {
    return Promise.resolve();
  }
  if (
    entry.snapshot.status === "error" &&
    entry.attemptedRevision >= currentRevision
  ) {
    return Promise.resolve();
  }
  if (entry.inFlight) return entry.inFlight;

  const generation = entry.generation;
  const previous = entry.snapshot;
  setSnapshot(entry, {
    data: previous.data,
    status: previous.data === undefined ? "loading" : "refreshing",
    error: null,
    dataRevision: previous.dataRevision,
  });

  const request = (async () => {
    const beforeRevision = getPersistenceRevisionForInterest(entry.interest);
    entry.attemptedRevision = beforeRevision;
    try {
      const data = await entry.load();
      if (entry.generation !== generation) return;
      const afterRevision = getPersistenceRevisionForInterest(entry.interest);

      if (beforeRevision !== afterRevision) {
        setSnapshot(entry, {
          data: entry.snapshot.data,
          status: entry.snapshot.data === undefined ? "loading" : "refreshing",
          error: null,
          dataRevision: entry.snapshot.dataRevision,
        });
        return;
      }

      setSnapshot(entry, {
        data,
        status: "ready",
        error: null,
        dataRevision: afterRevision,
      });
    } catch (error) {
      if (entry.generation !== generation) return;
      setSnapshot(entry, {
        data: entry.snapshot.data,
        status: "error",
        error: error instanceof Error ? error.message : "Query failed.",
        dataRevision: entry.snapshot.dataRevision,
      });
    }
  })().finally(() => {
    if (entry.generation !== generation) return;
    entry.inFlight = null;
    const latestRevision = getPersistenceRevisionForInterest(entry.interest);
    if (entry.snapshot.dataRevision < latestRevision) {
      queueMicrotask(() => {
        if (entry.generation === generation) void ensureFresh(entry);
      });
    }
    evictInactiveEntries();
  });

  entry.inFlight = request;
  return request;
}

function subscribeHandle<T>(
  handle: QueryHandle<T>,
  listener: () => void,
): () => void {
  const entry = getOrCreateEntry(handle);
  const wasInactive = entry.listeners.size === 0;
  entry.listeners.add(listener);
  if (wasInactive && entry.snapshot.status === "error") {
    entry.attemptedRevision = -1;
  }

  if (!entry.unsubscribePersistence) {
    entry.unsubscribePersistence = subscribeToPersistenceInterest(
      entry.interest,
      (_event, revision) => {
        if (revision <= entry.snapshot.dataRevision) return;
        if (entry.snapshot.data !== undefined && entry.snapshot.status !== "refreshing") {
          setSnapshot(entry, {
            ...entry.snapshot,
            status: "refreshing",
            error: null,
          });
        }
        queueMicrotask(() => void ensureFresh(entry));
      },
    );
  }

  void ensureFresh(entry);

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      entry.unsubscribePersistence?.();
      entry.unsubscribePersistence = null;
      touch(entry as ReactiveQueryEntry<unknown>);
      evictInactiveEntries();
    }
  };
}

function getHandleSnapshot<T>(handle: QueryHandle<T>): ReactiveQuerySnapshot<T> {
  const entry = getOrCreateEntry(handle);
  const currentRevision = getPersistenceRevisionForInterest(entry.interest);
  if (entry.snapshot.dataRevision < currentRevision && !entry.inFlight) {
    queueMicrotask(() => void ensureFresh(entry));
  }
  return entry.snapshot;
}

export function useReactiveQuery<Input, Result>(
  definition: ReactiveQueryDefinition<Input, Result>,
  provider: BudgetPersistenceProvider,
  input: Input,
  options: { readonly enabled?: boolean } = {},
): ReactiveQuerySnapshot<Result> {
  const enabled = options.enabled ?? true;
  const key = definition.key(input);
  const stableInputRef = useRef<{ key: string; input: Input }>({ key, input });
  if (stableInputRef.current.key !== key) {
    stableInputRef.current = { key, input };
  }
  const stableInput = stableInputRef.current.input;
  const handle = useMemo<QueryHandle<Result> | null>(() => {
    if (!enabled) return null;
    return {
      cacheKey: `${definition.id}:${key}`,
      interest: definition.interest(stableInput),
      load: () => definition.load(provider, stableInput),
    };
  }, [definition, enabled, key, provider, stableInput]);
  const subscribe = useCallback(
    (listener: () => void) =>
      handle ? subscribeHandle(handle, listener) : () => undefined,
    [handle],
  );
  const getSnapshot = useCallback(
    () => handle
      ? getHandleSnapshot(handle)
      : DISABLED_SNAPSHOT as ReactiveQuerySnapshot<Result>,
    [handle],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function prefetchReactiveQuery<Input, Result>(
  definition: ReactiveQueryDefinition<Input, Result>,
  provider: BudgetPersistenceProvider,
  input: Input,
): Promise<void> {
  const handle: QueryHandle<Result> = {
    cacheKey: `${definition.id}:${definition.key(input)}`,
    interest: definition.interest(input),
    load: () => definition.load(provider, input),
  };
  return ensureFresh(getOrCreateEntry(handle));
}

export function seedReactiveQuery<Input, Result>(
  definition: ReactiveQueryDefinition<Input, Result>,
  provider: BudgetPersistenceProvider,
  input: Input,
  data: Result,
  revision: number,
): void {
  const handle: QueryHandle<Result> = {
    cacheKey: `${definition.id}:${definition.key(input)}`,
    interest: definition.interest(input),
    load: () => definition.load(provider, input),
  };
  const entry = getOrCreateEntry(handle);
  const currentRevision = getPersistenceRevisionForInterest(entry.interest);
  if (
    revision !== currentRevision ||
    revision < entry.snapshot.dataRevision
  ) {
    return;
  }
  entry.generation += 1;
  entry.inFlight = null;
  entry.attemptedRevision = revision;
  setSnapshot(entry, {
    data,
    status: "ready",
    error: null,
    dataRevision: revision,
  });
}

export function resetReactiveQueryStore(): void {
  for (const [cacheKey, entry] of [...entries.entries()]) {
    entry.generation += 1;
    entry.inFlight = null;
    entry.attemptedRevision = -1;

    if (entry.listeners.size === 0) {
      entry.unsubscribePersistence?.();
      entry.unsubscribePersistence = null;
      entries.delete(cacheKey);
      continue;
    }

    entry.snapshot = {
      data: undefined,
      status: "idle",
      error: null,
      dataRevision: 0,
    };
    touch(entry);
    notify(entry);
  }
}

export function getReactiveQueryStoreDiagnosticsForTests(): {
  readonly entryCount: number;
  readonly activeEntryCount: number;
  readonly inFlightCount: number;
} {
  const values = [...entries.values()];
  return {
    entryCount: values.length,
    activeEntryCount: values.filter((entry) => entry.listeners.size > 0).length,
    inFlightCount: values.filter((entry) => entry.inFlight !== null).length,
  };
}

export function createReactiveQueryDefinition<Input, Result>(
  definition: ReactiveQueryDefinition<Input, Result>,
): ReactiveQueryDefinition<Input, Result> {
  return definition;
}
