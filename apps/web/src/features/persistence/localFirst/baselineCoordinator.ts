import { createSHA256 } from "hash-wasm";
import {
  LOCAL_BUDGET_SCHEMA_VERSION,
  assertCompleteManifest,
  type LocalBudgetManifest,
} from "./contracts";
import {
  LOCAL_FIRST_BASELINE_CHUNK_BYTES,
  createLocalFirstRelayTransport,
  decideBootstrap,
  type RelayBaselineManifest,
  type RelayBootstrap,
} from "./relayTransport";

export interface LocalFirstDeviceState {
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly baselineHash: string;
  readonly pulledCursor: number;
}

export interface LocalFirstBootstrapResult {
  readonly status: "ready" | "awaiting-baseline" | "rebuilt";
  readonly remote: RelayBootstrap;
  readonly manifest: LocalBudgetManifest | null;
  readonly deviceState: LocalFirstDeviceState | null;
}

export interface LocalFirstBaselineProgress {
  readonly phase: "hashing" | "uploading" | "downloading" | "activating";
  readonly completedBytes: number;
  readonly totalBytes: number;
}

type RelayTransport = ReturnType<typeof createLocalFirstRelayTransport>;

export interface LocalBaselineDatabasePort {
  getManifest(): Promise<LocalBudgetManifest>;
  open(input: {
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly deviceId: string;
  }): Promise<LocalBudgetManifest>;
  prepareBaselineExport(): Promise<{ readonly totalBytes: number }>;
  readBaselineExportChunk(offset: number, length: number): Promise<Uint8Array>;
  finishBaselineExport?(): Promise<void>;
  beginBaselineReplacement(input: {
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly deviceId: string;
    readonly totalBytes: number;
  }): Promise<void>;
  appendBaselineReplacement(
    offset: number,
    content: Uint8Array,
  ): Promise<{ readonly receivedBytes: number }>;
  commitBaselineReplacement(): Promise<LocalBudgetManifest>;
  abortBaselineReplacement(): Promise<void>;
  getSyncState?(): Promise<{
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly baselineHash: string | null;
    readonly pulledCursor: number;
  }>;
  setSyncState?(
    baselineHash: string,
    pulledCursor: number,
  ): Promise<{
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly baselineHash: string | null;
    readonly pulledCursor: number;
  }>;
}

export async function publishLocalBaseline(input: {
  readonly budgetId: string;
  readonly budgetName?: string;
  readonly currency?: string;
  readonly syncEpoch: string;
  readonly database: LocalBaselineDatabasePort;
  readonly relay: RelayTransport;
  readonly onProgress?: (progress: LocalFirstBaselineProgress) => void;
}): Promise<RelayBaselineManifest> {
  const localManifest = await input.database.getManifest();
  const localSyncState = await input.database.getSyncState?.();
  assertCompleteManifest(localManifest);
  if (
    localManifest.budgetId !== input.budgetId ||
    localManifest.syncEpoch !== input.syncEpoch ||
    !localManifest.durable
  ) {
    throw new Error("Only the durable local database for the active sync epoch may be published.");
  }
  const { totalBytes } = await input.database.prepareBaselineExport();
  try {
    const remoteBeforeExport = await input.relay.getBootstrap(input.budgetId);
    if (remoteBeforeExport.syncEpoch !== input.syncEpoch) {
      throw new Error("The sync epoch changed before baseline publication.");
    }
    if (remoteBeforeExport.baseline) {
      const previous = remoteBeforeExport.baseline.manifest;
      const regressions = Object.keys(previous.counts).filter((domain) => {
        const key = domain as keyof typeof previous.counts;
        return localManifest.counts[key] < previous.counts[key];
      });
      if (
        regressions.length > 0 &&
        (
          !localSyncState?.baselineHash ||
          localSyncState.pulledCursor <= previous.baseCursor
        )
      ) {
        throw new Error(
          "Refusing to publish an unexplained destructive baseline. " +
          `Local data is lower in: ${regressions.join(", ")}. ` +
          "Rebuild this device from the relay instead.",
        );
      }
    }
    const contentHash = await hashExport(input.database, totalBytes, input.onProgress);
    const manifest: RelayBaselineManifest = {
      budgetId: input.budgetId,
      ...(input.budgetName ? { budgetName: input.budgetName } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      syncEpoch: input.syncEpoch,
      schemaVersion: LOCAL_BUDGET_SCHEMA_VERSION,
      counts: localManifest.counts,
      chunkCount: Math.ceil(totalBytes / LOCAL_FIRST_BASELINE_CHUNK_BYTES),
      totalBytes,
      contentHash,
      baseCursor: localSyncState?.pulledCursor ?? 0,
      previousBaselineId: remoteBeforeExport.baseline?.baselineId ?? null,
    };
    const staging = await input.relay.beginBaseline(manifest);
    let uploadedBytes = 0;
    for (let chunkIndex = 0; chunkIndex < staging.chunkCount; chunkIndex += 1) {
      const offset = chunkIndex * LOCAL_FIRST_BASELINE_CHUNK_BYTES;
      const chunk = await input.database.readBaselineExportChunk(
        offset,
        Math.min(LOCAL_FIRST_BASELINE_CHUNK_BYTES, totalBytes - offset),
      );
      await input.relay.uploadBaselineChunk({
        budgetId: input.budgetId,
        syncEpoch: input.syncEpoch,
        baselineId: staging.baselineId,
        chunkIndex,
        content: chunk,
      });
      uploadedBytes += chunk.byteLength;
      input.onProgress?.({
        phase: "uploading",
        completedBytes: uploadedBytes,
        totalBytes,
      });
    }
    const committed = await input.relay.commitBaseline({
      budgetId: input.budgetId,
      syncEpoch: input.syncEpoch,
      baselineId: staging.baselineId,
    });
    if (
      committed.contentHash !== manifest.contentHash ||
      committed.totalBytes !== manifest.totalBytes
    ) {
      throw new Error("The relay acknowledged baseline metadata that differs from the local database.");
    }
    await input.database.setSyncState?.(
      manifest.contentHash,
      manifest.baseCursor,
    );
    return manifest;
  } finally {
    await input.database.finishBaselineExport?.();
  }
}

export async function bootstrapLocalBudget(input: {
  readonly budgetId: string;
  readonly deviceId: string;
  readonly database: LocalBaselineDatabasePort;
  readonly relay: RelayTransport;
  readonly localState: LocalFirstDeviceState | null;
  readonly onProgress?: (progress: LocalFirstBaselineProgress) => void;
}): Promise<LocalFirstBootstrapResult> {
  const remote = await input.relay.getBootstrap(input.budgetId);
  const decision = decideBootstrap({
    remote,
    localSyncEpoch: input.localState?.syncEpoch ?? null,
    localBaselineHash: input.localState?.baselineHash ?? null,
    pulledCursor: input.localState?.pulledCursor ?? 0,
  });
  if (decision.type === "await-baseline") {
    return {
      status: "awaiting-baseline",
      remote,
      manifest: null,
      deviceState: null,
    };
  }
  if (decision.type === "continue") {
    const manifest = await input.database.open({
      budgetId: input.budgetId,
      syncEpoch: decision.syncEpoch,
      deviceId: input.deviceId,
    });
    return {
      status: "ready",
      remote,
      manifest,
      deviceState: input.localState,
    };
  }

  await input.database.beginBaselineReplacement({
    budgetId: input.budgetId,
    syncEpoch: decision.syncEpoch,
    deviceId: input.deviceId,
    totalBytes: decision.manifest.totalBytes,
  });
  const hasher = await createSHA256();
  hasher.init();
  let receivedBytes = 0;
  try {
    for (
      let chunkIndex = 0;
      chunkIndex < decision.manifest.chunkCount;
      chunkIndex += 1
    ) {
      const chunk = await input.relay.downloadBaselineChunk({
        budgetId: input.budgetId,
        syncEpoch: decision.syncEpoch,
        baselineId: decision.baselineId,
        chunkIndex,
      });
      hasher.update(chunk);
      await input.database.appendBaselineReplacement(receivedBytes, chunk);
      receivedBytes += chunk.byteLength;
      input.onProgress?.({
        phase: "downloading",
        completedBytes: receivedBytes,
        totalBytes: decision.manifest.totalBytes,
      });
    }
    const contentHash = `sha256:${hasher.digest("hex")}`;
    if (
      receivedBytes !== decision.manifest.totalBytes ||
      contentHash !== decision.manifest.contentHash
    ) {
      throw new Error("Downloaded baseline failed complete-database integrity validation.");
    }
    input.onProgress?.({
      phase: "activating",
      completedBytes: receivedBytes,
      totalBytes: receivedBytes,
    });
    const manifest = await input.database.commitBaselineReplacement();
    assertCompleteManifest(manifest);
    await input.database.setSyncState?.(
      decision.manifest.contentHash,
      decision.manifest.baseCursor,
    );
    return {
      status: decision.type === "rebuild" ? "rebuilt" : "ready",
      remote,
      manifest,
      deviceState: {
        budgetId: input.budgetId,
        syncEpoch: decision.syncEpoch,
        baselineHash: decision.manifest.contentHash,
        pulledCursor: decision.manifest.baseCursor,
      },
    };
  } catch (error) {
    await input.database.abortBaselineReplacement().catch(() => undefined);
    throw error;
  }
}

async function hashExport(
  database: LocalBaselineDatabasePort,
  totalBytes: number,
  onProgress?: (progress: LocalFirstBaselineProgress) => void,
): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  let completedBytes = 0;
  while (completedBytes < totalBytes) {
    const chunk = await database.readBaselineExportChunk(
      completedBytes,
      Math.min(LOCAL_FIRST_BASELINE_CHUNK_BYTES, totalBytes - completedBytes),
    );
    if (chunk.byteLength === 0) throw new Error("Local SQLite baseline ended unexpectedly.");
    hasher.update(chunk);
    completedBytes += chunk.byteLength;
    onProgress?.({ phase: "hashing", completedBytes, totalBytes });
  }
  return `sha256:${hasher.digest("hex")}`;
}
