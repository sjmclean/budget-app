import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import type { ReplicationDiagnostics, ReplicationRunResult } from "./replication";
import type { ReplicationConflict } from "./conflictResolution";
import { replicatePersistenceProvider } from "./replicationEngine";
import { createHttpReplicationTransport } from "./replicationTransport";

export type ReplicationStatus =
  | "disabled"
  | "offline"
  | "connecting"
  | "synchronising"
  | "up-to-date"
  | "conflict"
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
  readonly uploadedBlobCount: number;
  readonly downloadedBlobCount: number;
  readonly retryAttempt: number;
  readonly retainedJournalEntryCount: number;
  readonly checkpointCount: number;
  readonly prunedJournalEntryCount: number;
  readonly unresolvedConflictCount: number;
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
  uploadedBlobCount: 0,
  downloadedBlobCount: 0,
  retryAttempt: 0,
  retainedJournalEntryCount: 0,
  checkpointCount: 0,
  prunedJournalEntryCount: 0,
  unresolvedConflictCount: 0,
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
  getDiagnostics(): Promise<ReplicationDiagnostics | null>;
  recoverFromServer(): Promise<boolean>;
  listConflicts(): Promise<ReplicationConflict[]>;
  resolveConflict(conflictId: string, resolution: "keep-local" | "accept-remote"): Promise<void>;
  stop(): void;
}

export function startReplicationBackgroundService(
  provider: BudgetPersistenceProvider,
  options: { apiBaseUrl?: string; intervalMs?: number; debounceMs?: number } = {},
): ReplicationBackgroundService {
  service?.stop();
  if (!provider.operationJournal || !provider.replicationStore) {
    update({ ...INITIAL, status: "disabled", supported: false });
    service = { syncNow: async () => null, getDiagnostics: async () => null, recoverFromServer: async () => false, listConflicts: async () => [], resolveConflict: async () => undefined, stop: () => undefined };
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

  const refreshDiagnostics = async () => {
    const diagnostics = await provider.replicationStore!.getReplicationDiagnostics();
    const pending = Math.max(0, diagnostics.latestLocalSequence - diagnostics.pushedLocalSequence);
    update({
      ...snapshot,
      supported: true,
      pendingOperationCount: pending,
      retainedJournalEntryCount: diagnostics.retainedJournalEntryCount,
      checkpointCount: diagnostics.checkpointCount,
      unresolvedConflictCount: diagnostics.unresolvedConflictCount,
    });
    return diagnostics;
  };

  const refreshPending = () => { void refreshDiagnostics(); };

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
          status: result.detectedConflictCount > 0 ? "conflict" : "up-to-date",
          lastSuccessfulSyncAt: new Date().toISOString(),
          lastError: null,
          generationId: result.generationId,
          pendingOperationCount: 0,
          pushedOperationCount: result.pushedOperationCount,
          pulledOperationCount: result.pulledOperationCount,
          uploadedBlobCount: result.uploadedBlobCount,
          downloadedBlobCount: result.downloadedBlobCount,
          retryAttempt: 0,
          prunedJournalEntryCount: result.prunedJournalEntryCount,
          unresolvedConflictCount: result.detectedConflictCount,
        });
        await refreshDiagnostics();
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
    getDiagnostics: () => refreshDiagnostics(),
    listConflicts: () => provider.conflicts?.listConflicts({ status: "unresolved", limit: 100 }) ?? Promise.resolve([]),
    async resolveConflict(conflictId, resolution): Promise<void> {
      if (!provider.conflicts) throw new Error("Conflict resolution is not supported by this provider.");
      await provider.conflicts.resolveConflict(conflictId, resolution);
      await refreshDiagnostics();
      if (resolution === "keep-local") schedule();
    },
    async recoverFromServer(): Promise<boolean> {
      if (running || stopped || !provider.checkpoints) return false;
      const remote = await transport.getGeneration();
      const checkpoint = await transport.getLatestCheckpoint(remote.generationId);
      if (!checkpoint) throw new Error("No remote checkpoint is available for recovery.");
      await provider.checkpoints.restoreCheckpoint(checkpoint);
      await provider.replicationStore!.setReplicationCursorState({
        generationId: remote.generationId,
        pushedLocalSequence: 0,
        pulledRemoteCursor: 0,
      });
      await run(false);
      return true;
    },
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
