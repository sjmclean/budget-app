import { createSHA256 } from "hash-wasm";
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";
import type { LocalBudgetDatabaseClient } from "./localBudgetClient";
import type { LocalBudgetManifest, LocalDatabasePromotionResult } from "./contracts";
import { LOCAL_FIRST_BASELINE_CHUNK_BYTES as CHUNK_BYTES,
  type createLocalFirstRelayTransport, type RelayBaselineManifest } from "./relayTransport";

type Database = Pick<LocalBudgetDatabaseClient,
  "getManifest" | "getSyncState" | "setSyncState" | "prepareRestorePoint" |
  "openPreparedRestorePoint" | "abortPreparedRestorePoint" | "commitPreparedRestorePoint" |
  "prepareBaselineExport" | "readBaselineExportChunk" | "finishBaselineExport" | "isGenerationPublished">;
type Relay = Pick<ReturnType<typeof createLocalFirstRelayTransport>,
  "getBootstrap" | "beginRestore" | "uploadBaselineChunk" | "commitRestore">;
type JournalStorage = Pick<Storage, "getItem" | "setItem"> & { flush?: () => Promise<void> };

interface RestoreJournal {
  version: 1;
  budgetId: string;
  previousSyncEpoch: string;
  baselineId: string;
  manifest: RelayBaselineManifest;
  promotion: LocalDatabasePromotionResult;
}
const journalKey = (budgetId: string) => `budget-app.sqlite-restore.pending.${budgetId}`;

export function restorePendingError(cause: unknown) {
  return Object.assign(new Error(
    "Restore publication is pending recovery. This budget is paused to protect both generations. " +
    "Reconnect and reload to resolve the restore before making further changes.",
  ), { code: "RESTORE_PENDING", cause });
}

/** Local promotion and the relay cannot share a transaction. A durable intent
 * bridges them: before intent, errors abort the candidate; after intent, an
 * uncertain outcome pauses the budget and is resumed idempotently on startup.
 */
export function createRestorePointReplacement(input: {
  database: Database; relay: Relay; storage: JournalStorage; deviceId: string;
}) {
  async function persist(budgetId: string, journal: RestoreJournal | null) {
    input.storage.setItem(journalKey(budgetId), journal ? JSON.stringify(journal) : "");
    await input.storage.flush?.();
  }

  async function discardRejectedIntent(budgetId: string, error: unknown) {
    if ((error as { details?: { restoreNotCommitted?: boolean } })?.details?.restoreNotCommitted !== true) return false;
    // The relay explicitly certifies the staging transaction never committed.
    // Clear intent before deleting its candidate so crash recovery cannot try
    // to resume a candidate whose file has already been removed.
    await persist(budgetId, null);
    await input.database.abortPreparedRestorePoint();
    return true;
  }

  async function finish(journal: RestoreJournal): Promise<LocalBudgetManifest> {
    await input.database.setSyncState(journal.manifest.contentHash, 0);
    input.storage.setItem(`budget-app.local-first.sync-epoch.${journal.budgetId}`, journal.manifest.syncEpoch);
    await input.storage.flush?.();
    const manifest = await input.database.commitPreparedRestorePoint(journal.promotion);
    await persist(journal.budgetId, null);
    return manifest;
  }

  async function confirm(journal: RestoreJournal) {
    const remote = await input.relay.getBootstrap(journal.budgetId);
    // A later baseline in the same unique epoch also proves this restore
    // committed. Ordinary bootstrap will then pull that newer baseline.
    if (remote.syncEpoch === journal.manifest.syncEpoch && remote.baseline) return;
    const committed = await input.relay.commitRestore({
      budgetId: journal.budgetId, syncEpoch: journal.manifest.syncEpoch,
      baselineId: journal.baselineId,
    });
    if (committed.baselineId !== journal.baselineId ||
        committed.contentHash !== journal.manifest.contentHash ||
        committed.totalBytes !== journal.manifest.totalBytes) {
      throw new Error("Restore commit acknowledgement did not match the staged SQLite database.");
    }
  }

  async function recover(budgetId: string): Promise<boolean> {
    const raw = input.storage.getItem(journalKey(budgetId));
    if (!raw) return false;
    try {
      const journal = JSON.parse(raw) as RestoreJournal;
      if (journal.version !== 1 || journal.budgetId !== budgetId ||
          journal.manifest.budgetId !== budgetId || journal.promotion.manifest.budgetId !== budgetId ||
          journal.manifest.syncEpoch !== journal.promotion.manifest.syncEpoch || !journal.baselineId) {
        throw new Error("Invalid pending restore journal.");
      }
      const alreadyPublished = input.database.isGenerationPublished(journal.promotion);
      await input.database.openPreparedRestorePoint(journal.promotion, journal.previousSyncEpoch, input.deviceId);
      if (!alreadyPublished) await confirm(journal);
      await finish(journal);
      return true;
    } catch (error) {
      try {
        if (await discardRejectedIntent(budgetId, error)) return false;
      } catch (cleanupError) {
        throw restorePendingError(cleanupError);
      }
      throw restorePendingError(error);
    }
  }

  async function restore(budgetId: string, pointId: string): Promise<LocalBudgetManifest> {
    if (input.storage.getItem(journalKey(budgetId))) throw restorePendingError("A previous restore needs recovery.");
    const current = await input.database.getManifest();
    const state = await input.database.getSyncState();
    const remote = await input.relay.getBootstrap(budgetId);
    if (current.budgetId !== budgetId || state.budgetId !== budgetId ||
        current.syncEpoch !== state.syncEpoch || current.syncEpoch !== remote.syncEpoch ||
        state.pulledCursor !== remote.latestCursor) {
      throw new Error("The budget changed before restore. Synchronise and try again.");
    }
    let intentAttempted = false;
    let prepared = false;
    try {
      const promotion = await input.database.prepareRestorePoint({
        budgetId, pointId, syncEpoch: createRuntimeUuid(), deviceId: input.deviceId,
      });
      prepared = true;
      const { totalBytes } = await input.database.prepareBaselineExport();
      let journal: RestoreJournal;
      try {
        const hasher = await createSHA256();
        hasher.init();
        for (let offset = 0; offset < totalBytes; offset += CHUNK_BYTES) {
          const length = Math.min(CHUNK_BYTES, totalBytes - offset);
          const chunk = await input.database.readBaselineExportChunk(offset, length);
          if (chunk.byteLength !== length) throw new Error("Prepared restore export is incomplete.");
          hasher.update(chunk);
        }
        const manifest: RelayBaselineManifest = {
          budgetId, syncEpoch: promotion.manifest.syncEpoch, schemaVersion: promotion.manifest.schemaVersion,
          ...(remote.baseline?.manifest.budgetName ? { budgetName: remote.baseline.manifest.budgetName } : {}),
          ...(remote.baseline?.manifest.currency ? { currency: remote.baseline.manifest.currency } : {}),
          counts: promotion.manifest.counts, chunkCount: Math.ceil(totalBytes / CHUNK_BYTES), totalBytes,
          contentHash: `sha256:${hasher.digest("hex")}`, baseCursor: 0, previousBaselineId: null,
        };
        const staged = await input.relay.beginRestore({
          syncEpoch: current.syncEpoch, latestCursor: state.pulledCursor,
          baselineId: remote.baseline?.baselineId ?? null,
        }, manifest);
        if (staged.chunkCount !== manifest.chunkCount) throw new Error("Restore upload manifest mismatch.");
        for (let chunkIndex = 0; chunkIndex < manifest.chunkCount; chunkIndex++) {
          const offset = chunkIndex * CHUNK_BYTES;
          await input.relay.uploadBaselineChunk({
            budgetId, syncEpoch: manifest.syncEpoch, baselineId: staged.baselineId, chunkIndex,
            content: await input.database.readBaselineExportChunk(offset, Math.min(CHUNK_BYTES, totalBytes - offset)),
          });
        }
        journal = { version: 1, budgetId, previousSyncEpoch: current.syncEpoch,
          baselineId: staged.baselineId, manifest, promotion };
      } finally {
        await input.database.finishBaselineExport();
      }
      // Never send the authoritative remote commit until intent is durable.
      intentAttempted = true;
      await persist(budgetId, journal);
      await confirm(journal);
      return await finish(journal);
    } catch (error) {
      if (intentAttempted) {
        let discarded: boolean;
        try {
          discarded = await discardRejectedIntent(budgetId, error);
        } catch (cleanupError) {
          throw restorePendingError(cleanupError);
        }
        if (discarded) throw error;
        throw restorePendingError(error);
      }
      if (prepared) {
        try { await input.database.abortPreparedRestorePoint(); }
        catch (rollbackError) { throw restorePendingError(rollbackError); }
      }
      throw error;
    }
  }
  return { restore, recover };
}
