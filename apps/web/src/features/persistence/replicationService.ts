import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import type { ReplicationDiagnostics, ReplicationRunResult } from "./replication";
import type { ReplicationConflict } from "./conflictResolution";
import { replicatePersistenceProvider } from "./replicationEngine";
import { recordReplicationTraceEvent } from "./replicationTrace";
import { createHttpReplicationTransport } from "./replicationTransport";
import { createPersistenceCheckpoint } from "./checkpoint";
import { checkServerOperationalHealth, type ServerOperationalStatus } from "./serverOperationalHealth";
import { getActiveBudgetIdFromStorage } from "../budget/budgetDataScope";
import { readBudgetRegistry } from "../budget/budgetRegistry";
import { createLocalFirstRelayTransport } from "./localFirst/relayTransport";
import {
  subscribeToLocalFirstRelayEvents,
  type LocalFirstRelayEventSubscription,
} from "./localFirst/relayEvents";
import { subscribeToLocalFirstMutationCommits } from "./localFirst/mutationEvents";

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
  readonly serverStatus: ServerOperationalStatus;
  readonly serverLatencyMs: number | null;
  readonly serverHealthCheckedAt: string | null;
  readonly serverHealthError: string | null;
  readonly serverProtocolVersion: number | null;
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
  serverStatus: "unknown",
  serverLatencyMs: null,
  serverHealthCheckedAt: null,
  serverHealthError: null,
  serverProtocolVersion: null,
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
  publishLocalBaseline(): Promise<boolean>;
  listConflicts(): Promise<ReplicationConflict[]>;
  resolveConflict(conflictId: string, resolution: "keep-local" | "accept-remote"): Promise<void>;
  checkServerHealth(): Promise<boolean>;
  stop(): void;
}

export function startReplicationBackgroundService(
  provider: BudgetPersistenceProvider,
  options: { apiBaseUrl?: string; intervalMs?: number; debounceMs?: number } = {},
): ReplicationBackgroundService {
  service?.stop();
  if (provider.syncArchitecture === "local-first-relay") {
    const localFirstRelay = createLocalFirstRelayTransport({
      apiBaseUrl: options.apiBaseUrl,
    });
    const activeBudgetId = () => provider.keyValueStorage
      ? getActiveBudgetIdFromStorage(provider.keyValueStorage)
      : null;
    const intervalMs = options.intervalMs ?? 60_000;
    let stopped = false;
    let running: Promise<ReplicationRunResult | null> | null = null;
    let intervalTimer: ReturnType<typeof setInterval> | null = null;
    let subscriptionScopeTimer: ReturnType<typeof setInterval> | null = null;
    let eventSubscription: LocalFirstRelayEventSubscription | null = null;
    let subscribedBudgetId: string | null = null;
    let eventDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const mutationDebounceMs = options.debounceMs ?? 250;
    const localConflictClient = () => provider.accountRegisterQueries as
      | (typeof provider.accountRegisterQueries & {
          listSyncConflicts?(budgetId: string): Promise<ReplicationConflict[]>;
          resolveSyncConflict?(
            budgetId: string,
            conflictId: string,
            resolution: "keep-local" | "accept-remote",
          ): Promise<void>;
        })
      | undefined;

    const connectEvents = () => {
      const budgetId = activeBudgetId();
      if (budgetId === subscribedBudgetId) return;
      eventSubscription?.close();
      eventSubscription = null;
      subscribedBudgetId = budgetId;
      if (!budgetId) return;
      eventSubscription = subscribeToLocalFirstRelayEvents({
        budgetId,
        apiBaseUrl: options.apiBaseUrl,
        onEvent: () => {
          if (eventDebounceTimer) clearTimeout(eventDebounceTimer);
          eventDebounceTimer = setTimeout(() => void syncNow(), 100);
        },
      });
    };

    const checkHealth = async (): Promise<boolean> => {
      update({ ...snapshot, supported: true, serverStatus: "checking", serverHealthError: null });
      const health = await checkServerOperationalHealth({ baseUrl: options.apiBaseUrl });
      update({
        ...snapshot,
        supported: true,
        serverStatus: health.status,
        serverLatencyMs: health.latencyMs,
        serverHealthCheckedAt: health.checkedAt,
        serverHealthError: health.error,
        serverProtocolVersion: health.readiness?.protocolVersion ?? null,
      });
      return health.status === "ready";
    };

    const syncNow = async (): Promise<ReplicationRunResult | null> => {
      if (stopped) return null;
      if (running) return running;
      running = (async () => {
        connectEvents();
        if (typeof navigator !== "undefined" && !navigator.onLine) {
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
          await checkHealth();
          const budgetId = activeBudgetId();
          if (!budgetId || !provider.accountRegisterQueries) {
            update({ ...snapshot, supported: true, status: "up-to-date", lastError: null });
            return null;
          }
          const budget = provider.keyValueStorage
            ? readBudgetRegistry(provider.keyValueStorage).find((entry) => entry.id === budgetId)
            : null;
          if (budget) {
            await localFirstRelay.updateBudgetMetadata({
              budgetId,
              budgetName: budget.name,
              currency: budget.currency,
            });
          }
          const status = await provider.accountRegisterQueries.getBudgetStatus(budgetId);
          // Local-first query clients synchronise the transactional outbox and
          // pull remote mutations before returning navigation data.
          await provider.accountRegisterQueries.listAccountNavigation(budgetId);
          const conflicts = await localConflictClient()
            ?.listSyncConflicts?.(budgetId) ?? [];
          const result: ReplicationRunResult = {
            generationId: status.generationId ?? "",
            pushedOperationCount: 0,
            pulledOperationCount: 0,
            finalLocalSequence: 0,
            finalRemoteCursor: 0,
            checkpointUploaded: false,
            uploadedBlobCount: 0,
            downloadedBlobCount: 0,
            prunedJournalEntryCount: 0,
            detectedConflictCount: 0,
            integrityVerified: true,
            integrityRepairPerformed: false,
          };
          update({
            ...snapshot,
            supported: true,
            status: conflicts.length > 0 ? "conflict" : "up-to-date",
            generationId: status.generationId,
            lastSuccessfulSyncAt: new Date().toISOString(),
            lastError: null,
            retryAttempt: 0,
            unresolvedConflictCount: conflicts.length,
          });
          return result;
        } catch (error) {
          update({
            ...snapshot,
            supported: true,
            status: "error",
            lastError: error instanceof Error ? error.message : "Local-first synchronisation failed.",
          });
          return null;
        } finally {
          running = null;
        }
      })();
      return running;
    };

    update({
      ...INITIAL,
      status: "connecting",
      supported: true,
      lastError: null,
    });
    const online = () => { void syncNow(); };
    const offline = () => update({ ...snapshot, supported: true, status: "offline" });
    const visible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void syncNow();
      }
    };
    const pageShow = () => { void syncNow(); };
    const unsubscribeMutationCommits = subscribeToLocalFirstMutationCommits(
      (budgetId) => {
        if (budgetId !== activeBudgetId()) return;
        update({
          ...snapshot,
          supported: true,
          status: typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "synchronising",
        });
        if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(
          () => void syncNow(),
          mutationDebounceMs,
        );
      },
    );
    globalThis.addEventListener?.("online", online);
    globalThis.addEventListener?.("offline", offline);
    globalThis.addEventListener?.("pageshow", pageShow);
    globalThis.document?.addEventListener?.("visibilitychange", visible);
    intervalTimer = setInterval(() => { void syncNow(); }, intervalMs);
    subscriptionScopeTimer = setInterval(connectEvents, 2_000);
    service = {
      syncNow,
      getDiagnostics: async () => null,
      recoverFromServer: async () => false,
      publishLocalBaseline: async () => {
        const budgetId = activeBudgetId();
        const publisher = provider.accountRegisterQueries as
          | (typeof provider.accountRegisterQueries & {
              publishLocalBaseline?(budgetId: string): Promise<boolean>;
            })
          | undefined;
        if (!budgetId || !publisher?.publishLocalBaseline) return false;
        update({
          ...snapshot,
          supported: true,
          status: "synchronising",
          lastAttemptAt: new Date().toISOString(),
          lastError: null,
        });
        try {
          const published = await publisher.publishLocalBaseline(budgetId);
          await syncNow();
          return published;
        } catch (error) {
          update({
            ...snapshot,
            supported: true,
            status: "error",
            lastError: error instanceof Error
              ? error.message
              : "Baseline compaction failed.",
          });
          return false;
        }
      },
      listConflicts: async () => {
        const budgetId = activeBudgetId();
        if (!budgetId) return [];
        return localConflictClient()?.listSyncConflicts?.(budgetId) ?? [];
      },
      resolveConflict: async (conflictId, resolution) => {
        const budgetId = activeBudgetId();
        const client = localConflictClient();
        if (!budgetId || !client?.resolveSyncConflict) {
          throw new Error("Local-first conflict resolution is unavailable.");
        }
        await client.resolveSyncConflict(budgetId, conflictId, resolution);
        const conflicts = await client.listSyncConflicts?.(budgetId) ?? [];
        update({
          ...snapshot,
          status: conflicts.length > 0 ? "conflict" : "up-to-date",
          unresolvedConflictCount: conflicts.length,
        });
      },
      checkServerHealth: checkHealth,
      stop: () => {
        stopped = true;
        if (intervalTimer) clearInterval(intervalTimer);
        if (subscriptionScopeTimer) clearInterval(subscriptionScopeTimer);
        if (eventDebounceTimer) clearTimeout(eventDebounceTimer);
        if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
        unsubscribeMutationCommits();
        eventSubscription?.close();
        globalThis.removeEventListener?.("online", online);
        globalThis.removeEventListener?.("offline", offline);
        globalThis.removeEventListener?.("pageshow", pageShow);
        globalThis.document?.removeEventListener?.("visibilitychange", visible);
      },
    };
    void syncNow();
    return service;
  }
  if (!provider.operationJournal || !provider.replicationStore) {
    update({ ...INITIAL, status: "disabled", supported: false });
    service = { syncNow: async () => null, getDiagnostics: async () => null, recoverFromServer: async () => false, publishLocalBaseline: async () => false, listConflicts: async () => [], resolveConflict: async () => undefined, checkServerHealth: async () => false, stop: () => undefined };
    return service;
  }

  const activeBudgetId = () => provider.keyValueStorage
    ? getActiveBudgetIdFromStorage(provider.keyValueStorage)
    : null;
  const transportForBudget = (budgetId: string) => createHttpReplicationTransport({
    budgetId,
    ...(options.apiBaseUrl ? { baseUrl: options.apiBaseUrl } : {}),
  });
  const intervalMs = options.intervalMs ?? 60_000;
  const debounceMs = options.debounceMs ?? 1_500;
  let stopped = false;
  let running: Promise<ReplicationRunResult | null> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const refreshDiagnostics = async () => {
    const diagnostics = await provider.replicationStore!.getReplicationDiagnostics(
      activeBudgetId() ?? undefined,
    );
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

  const checkHealth = async (): Promise<boolean> => {
    update({ ...snapshot, supported: true, serverStatus: "checking", serverHealthError: null });
    const health = await checkServerOperationalHealth({ baseUrl: options.apiBaseUrl });
    update({
      ...snapshot,
      supported: true,
      serverStatus: health.status,
      serverLatencyMs: health.latencyMs,
      serverHealthCheckedAt: health.checkedAt,
      serverHealthError: health.error,
      serverProtocolVersion: health.readiness?.protocolVersion ?? null,
    });
    return health.status === "ready";
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
        await checkHealth();
        const budgetId = activeBudgetId();
        if (!budgetId) {
          update({ ...snapshot, status: "disabled", lastError: null });
          return null;
        }
        const transport = transportForBudget(budgetId);
        const result = await replicatePersistenceProvider(provider, transport, {
          budgetId,
          uploadCheckpoint,
          onTrace: recordReplicationTraceEvent,
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
    checkServerHealth: checkHealth,
    async recoverFromServer(): Promise<boolean> {
      const budgetId = activeBudgetId();
      if (!budgetId || !provider.checkpoints) return false;
      const transport = transportForBudget(budgetId);
      const generation = await transport.getGeneration();
      const checkpoint = await transport.getLatestCheckpoint(generation.generationId);
      if (!checkpoint) return false;
      await provider.checkpoints.restoreCheckpoint(checkpoint, [], budgetId);
      await provider.replicationStore!.setReplicationCursorState({
        generationId: generation.generationId,
        pushedLocalSequence: 0,
        pulledRemoteCursor: checkpoint.replicatedThroughCursor ?? 0,
      }, budgetId);
      await run(false);
      return true;
    },
    async publishLocalBaseline(): Promise<boolean> {
      const budgetId = activeBudgetId();
      if (!budgetId || !provider.checkpoints || !provider.replicationStore) return false;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (running) await running;
      const transport = transportForBudget(budgetId);
      const generation = await transport.getGeneration();
      if (generation.latestCheckpointId) {
        throw new Error(
          "The server already has a checkpoint. Rebuild from server or resolve the conflict instead.",
        );
      }
      const created = await provider.checkpoints.createCheckpoint(budgetId);
      const checkpoint = createPersistenceCheckpoint({
        checkpointId: created.checkpointId,
        deviceId: created.deviceId,
        throughSequence: created.throughSequence,
        schemaVersion: created.schemaVersion,
        entries: created.entries,
        createdAt: new Date(created.createdAt),
        replicatedThroughCursor: generation.latestCursor,
      });
      const acknowledgement = await transport.uploadCheckpoint(
        generation.generationId,
        checkpoint,
      );
      if (
        acknowledgement.checkpointId !== checkpoint.checkpointId ||
        acknowledgement.integrityHash !== checkpoint.integrityHash ||
        acknowledgement.replicatedThroughCursor !== generation.latestCursor
      ) {
        throw new Error("The server did not acknowledge the published local baseline.");
      }
      const journal = provider.operationJournal!.getJournalCursor();
      await provider.replicationStore.setReplicationCursorState({
        generationId: generation.generationId,
        pushedLocalSequence: journal.latestSequence,
        pulledRemoteCursor: generation.latestCursor,
      }, budgetId);
      update({
        ...snapshot,
        status: "up-to-date",
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastError: null,
        generationId: generation.generationId,
        retryAttempt: 0,
      });
      await refreshDiagnostics();
      return true;
    },
    stop() {
      stopped = true;
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
