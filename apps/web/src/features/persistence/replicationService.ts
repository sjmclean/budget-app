import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import type { ReplicationRunResult } from "./replication";
import { replicatePersistenceProvider } from "./replicationEngine";
import { createHttpReplicationTransport } from "./replicationTransport";

export type ReplicationStatus =
  | "disabled"
  | "offline"
  | "connecting"
  | "synchronising"
  | "up-to-date"
  | "retrying"
  | "error";

export interface ReplicationServiceSnapshot {
  readonly status: ReplicationStatus;
  readonly supported: boolean;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly lastError: string | null;
  readonly generationId: string | null;
  readonly pendingOperationCount: number;
  readonly pushedOperationCount: number;
  readonly pulledOperationCount: number;
  readonly retryAttempt: number;
}

const INITIAL: ReplicationServiceSnapshot = {
  status: "disabled",
  supported: false,
  lastSuccessfulSyncAt: null,
  lastAttemptAt: null,
  lastError: null,
  generationId: null,
  pendingOperationCount: 0,
  pushedOperationCount: 0,
  pulledOperationCount: 0,
  retryAttempt: 0,
};

let snapshot = INITIAL;
const listeners = new Set<() => void>();
let service: ReplicationBackgroundService | null = null;

export function subscribeReplicationService(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReplicationServiceSnapshot(): ReplicationServiceSnapshot {
  return snapshot;
}

export function getReplicationBackgroundService(): ReplicationBackgroundService | null {
  return service;
}

export interface ReplicationBackgroundService {
  syncNow(options?: { uploadCheckpoint?: boolean }): Promise<ReplicationRunResult | null>;
  stop(): void;
}

export function startReplicationBackgroundService(
  provider: BudgetPersistenceProvider,
  options: { apiBaseUrl?: string; intervalMs?: number; debounceMs?: number } = {},
): ReplicationBackgroundService {
  service?.stop();
  if (!provider.operationJournal || !provider.replicationStore) {
    update({ ...INITIAL, status: "disabled", supported: false });
    service = { syncNow: async () => null, stop: () => undefined };
    return service;
  }

  const transport = createHttpReplicationTransport({ baseUrl: options.apiBaseUrl });
  const intervalMs = options.intervalMs ?? 60_000;
  const debounceMs = options.debounceMs ?? 1_500;
  let stopped = false;
  let running: Promise<ReplicationRunResult | null> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const refreshPending = () => {
    const cursor = provider.operationJournal!.getJournalCursor();
    const pending = Math.max(0, cursor.latestSequence - (snapshot.generationId ? 0 : 0));
    update({ ...snapshot, supported: true, pendingOperationCount: pending });
  };

  const run = async (uploadCheckpoint = false): Promise<ReplicationRunResult | null> => {
    if (stopped) return null;
    if (running) return running;
    running = (async () => {
      const online = typeof navigator === "undefined" || navigator.onLine;
      if (!online) {
        update({ ...snapshot, supported: true, status: "offline" });
        return null;
      }
      update({
        ...snapshot,
        supported: true,
        status: snapshot.lastSuccessfulSyncAt ? "synchronising" : "connecting",
        lastAttemptAt: new Date().toISOString(),
        lastError: null,
      });
      try {
        const result = await replicatePersistenceProvider(provider, transport, {
          uploadCheckpoint,
        });
        update({
          ...snapshot,
          supported: true,
          status: "up-to-date",
          lastSuccessfulSyncAt: new Date().toISOString(),
          lastError: null,
          generationId: result.generationId,
          pendingOperationCount: 0,
          pushedOperationCount: result.pushedOperationCount,
          pulledOperationCount: result.pulledOperationCount,
          retryAttempt: 0,
        });
        return result;
      } catch (error) {
        const retryAttempt = snapshot.retryAttempt + 1;
        update({
          ...snapshot,
          supported: true,
          status: "retrying",
          lastError: error instanceof Error ? error.message : "Replication failed.",
          retryAttempt,
        });
        const delay = Math.min(60_000, 1_000 * 2 ** Math.min(retryAttempt, 6));
        if (!stopped) retryTimer = setTimeout(() => void run(false), delay);
        return null;
      } finally {
        running = null;
      }
    })();
    return running;
  };

  const schedule = () => {
    refreshPending();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void run(false), debounceMs);
  };

  const unsubscribe = provider.watch?.(schedule) ?? (() => undefined);
  const onlineHandler = () => void run(false);
  const offlineHandler = () => update({ ...snapshot, status: "offline" });
  globalThis.addEventListener?.("online", onlineHandler);
  globalThis.addEventListener?.("offline", offlineHandler);
  intervalTimer = setInterval(() => void run(false), intervalMs);
  update({ ...INITIAL, supported: true, status: "connecting" });
  void run(false);

  service = {
    syncNow: ({ uploadCheckpoint = false } = {}) => run(uploadCheckpoint),
    stop() {
      stopped = true;
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      globalThis.removeEventListener?.("online", onlineHandler);
      globalThis.removeEventListener?.("offline", offlineHandler);
    },
  };
  return service;
}

function update(next: ReplicationServiceSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}
