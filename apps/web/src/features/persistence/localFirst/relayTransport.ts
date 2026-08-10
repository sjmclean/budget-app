import type {
  BudgetDomainCounts,
  LocalFirstMutationConflict,
  LocalBudgetMutation,
} from "./contracts";

export const LOCAL_FIRST_RELAY_PROTOCOL_VERSION = 2;
export const LOCAL_FIRST_BASELINE_CHUNK_BYTES = 4 * 1024 * 1024;

export interface RelayBaselineManifest {
  readonly budgetId: string;
  readonly budgetName?: string;
  readonly currency?: string;
  readonly syncEpoch: string;
  readonly schemaVersion: number;
  readonly counts: BudgetDomainCounts;
  readonly chunkCount: number;
  readonly totalBytes: number;
  readonly contentHash: string;
  readonly baseCursor: number;
  readonly previousBaselineId: string | null;
}

export interface RelayBootstrap {
  readonly protocolVersion: number;
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly schemaVersion: number;
  readonly latestCursor: number;
  readonly baseline: {
    readonly baselineId: string;
    readonly manifest: RelayBaselineManifest;
    readonly committedAt: string;
  } | null;
}

export type BootstrapDecision =
  | { readonly type: "await-baseline"; readonly syncEpoch: string }
  | {
      readonly type: "download-baseline";
      readonly syncEpoch: string;
      readonly baselineId: string;
      readonly manifest: RelayBaselineManifest;
    }
  | {
      readonly type: "continue";
      readonly syncEpoch: string;
      readonly afterCursor: number;
    }
  | {
      readonly type: "rebuild";
      readonly previousSyncEpoch: string;
      readonly syncEpoch: string;
      readonly baselineId: string;
      readonly manifest: RelayBaselineManifest;
    };

export function decideBootstrap(input: {
  readonly remote: RelayBootstrap;
  readonly localSyncEpoch: string | null;
  readonly localBaselineHash: string | null;
  readonly pulledCursor: number;
}): BootstrapDecision {
  if (input.remote.protocolVersion !== LOCAL_FIRST_RELAY_PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported local-first relay protocol ${input.remote.protocolVersion}.`,
    );
  }
  if (!input.remote.baseline) {
    return { type: "await-baseline", syncEpoch: input.remote.syncEpoch };
  }
  const baseline = input.remote.baseline;
  if (!input.localSyncEpoch) {
    return {
      type: "download-baseline",
      syncEpoch: input.remote.syncEpoch,
      baselineId: baseline.baselineId,
      manifest: baseline.manifest,
    };
  }
  if (input.localSyncEpoch !== input.remote.syncEpoch) {
    return {
      type: "rebuild",
      previousSyncEpoch: input.localSyncEpoch,
      syncEpoch: input.remote.syncEpoch,
      baselineId: baseline.baselineId,
      manifest: baseline.manifest,
    };
  }
  if (input.localBaselineHash !== baseline.manifest.contentHash) {
    return {
      type: "download-baseline",
      syncEpoch: input.remote.syncEpoch,
      baselineId: baseline.baselineId,
      manifest: baseline.manifest,
    };
  }
  return {
    type: "continue",
    syncEpoch: input.remote.syncEpoch,
    afterCursor: Math.max(input.pulledCursor, baseline.manifest.baseCursor),
  };
}

export function createLocalFirstRelayTransport(options: {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
} = {}) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "").replace(/\/+$/, "");

  async function json<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetchImplementation(`${apiBaseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({})) as {
      code?: string;
      message?: string;
      expectedSyncEpoch?: string;
      actualSyncEpoch?: string;
    };
    if (!response.ok) {
      throw Object.assign(
        new Error(body.message ?? `Local-first relay failed with HTTP ${response.status}.`),
        { ...body, status: response.status },
      );
    }
    return body as T;
  }

  function query(budgetId: string, values: Record<string, string | number> = {}) {
    const params = new URLSearchParams({ budgetId });
    for (const [key, value] of Object.entries(values)) params.set(key, String(value));
    return params;
  }

  return {
    updateBudgetMetadata(input: {
      readonly budgetId: string;
      readonly budgetName: string;
      readonly currency: string;
    }) {
      return json<{
        readonly budgetId: string;
        readonly budgetName: string;
        readonly currency: string;
        readonly updatedAt: string;
      }>(`/api/local-first/metadata?${query(input.budgetId)}`, {
        method: "PUT",
        body: JSON.stringify({
          budgetName: input.budgetName,
          currency: input.currency,
        }),
      });
    },

    async getBootstrap(budgetId: string): Promise<RelayBootstrap> {
      const bootstrap = await json<RelayBootstrap>(
        `/api/local-first/bootstrap?${query(budgetId)}`,
      );
      if (!bootstrap.baseline) return bootstrap;
      const baseCursor = bootstrap.baseline.manifest.baseCursor;
      if (baseCursor === undefined || baseCursor === null) {
        return {
          ...bootstrap,
          baseline: {
            ...bootstrap.baseline,
            manifest: {
              ...bootstrap.baseline.manifest,
              baseCursor: 0,
            },
          },
        };
      }
      if (!Number.isSafeInteger(baseCursor) || baseCursor < 0) {
        throw Object.assign(
          new Error("The relay baseline contains an invalid base cursor."),
          { code: "INVALID_STORED_BASELINE" },
        );
      }
      return bootstrap;
    },

    resetEpoch(budgetId: string, schemaVersion: number) {
      return json<{
        readonly budgetId: string;
        readonly syncEpoch: string;
        readonly previousSyncEpoch: string | null;
        readonly schemaVersion: number;
      }>(`/api/local-first/epoch/reset?${query(budgetId)}`, {
        method: "POST",
        body: JSON.stringify({ schemaVersion }),
      });
    },

    beginBaseline(manifest: RelayBaselineManifest) {
      return json<{ readonly baselineId: string; readonly chunkCount: number }>(
        `/api/local-first/baselines?${query(manifest.budgetId)}`,
        {
          method: "POST",
          body: JSON.stringify({ syncEpoch: manifest.syncEpoch, manifest }),
        },
      );
    },

    async uploadBaselineChunk(input: {
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly baselineId: string;
      readonly chunkIndex: number;
      readonly content: Uint8Array;
    }) {
      if (input.content.byteLength > LOCAL_FIRST_BASELINE_CHUNK_BYTES) {
        throw new Error("Baseline chunk exceeds the 4 MiB transport limit.");
      }
      const contentHash = await sha256(input.content);
      const params = query(input.budgetId, { syncEpoch: input.syncEpoch });
      const response = await fetchImplementation(
        `${apiBaseUrl}/api/local-first/baselines/${encodeURIComponent(input.baselineId)}` +
          `/chunks/${input.chunkIndex}?${params}`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/octet-stream",
            "X-Content-Hash": contentHash,
          },
          body: input.content as BodyInit,
        },
      );
      const body = await response.json().catch(() => ({})) as {
        code?: string;
        message?: string;
      };
      if (!response.ok) {
        throw Object.assign(
          new Error(body.message ?? `Baseline chunk upload failed with HTTP ${response.status}.`),
          { ...body, status: response.status },
        );
      }
      return body;
    },

    commitBaseline(input: {
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly baselineId: string;
    }) {
      return json<{
        readonly baselineId: string;
        readonly contentHash: string;
        readonly totalBytes: number;
        readonly committedAt: string;
        readonly baseCursor: number;
        readonly compactedMutationCount: number;
      }>(
        `/api/local-first/baselines/${encodeURIComponent(input.baselineId)}` +
          `/commit?${query(input.budgetId)}`,
        {
          method: "POST",
          body: JSON.stringify({ syncEpoch: input.syncEpoch }),
        },
      );
    },

    async downloadBaselineChunk(input: {
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly baselineId: string;
      readonly chunkIndex: number;
    }): Promise<Uint8Array> {
      const response = await fetchImplementation(
        `${apiBaseUrl}/api/local-first/baselines/${encodeURIComponent(input.baselineId)}` +
          `/chunks/${input.chunkIndex}?${query(input.budgetId, {
            syncEpoch: input.syncEpoch,
          })}`,
        { credentials: "include", headers: { Accept: "application/octet-stream" } },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Baseline download failed with HTTP ${response.status}.`);
      }
      const content = new Uint8Array(await response.arrayBuffer());
      const expectedHash = response.headers.get("X-Content-Hash");
      if (!expectedHash || await sha256(content) !== expectedHash) {
        throw new Error("Downloaded baseline chunk failed integrity validation.");
      }
      return content;
    },

    pushMutations(input: {
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly mutations: readonly LocalBudgetMutation[];
    }) {
      return json<{
        readonly acceptedCount: number;
        readonly acknowledgedCount: number;
        readonly latestCursor: number;
        readonly detectedConflictCount: number;
      }>(`/api/local-first/mutations?${query(input.budgetId)}`, {
        method: "POST",
        body: JSON.stringify({
          syncEpoch: input.syncEpoch,
          mutations: input.mutations,
        }),
      });
    },

    pullMutations(input: {
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly afterCursor: number;
      readonly limit?: number;
    }) {
      return json<{
        readonly mutations: readonly {
          readonly cursor: number;
          readonly receivedAt: string;
          readonly mutation: LocalBudgetMutation;
          readonly conflict?: LocalFirstMutationConflict;
        }[];
        readonly latestCursor: number;
        readonly hasMore: boolean;
        readonly baseCursor: number;
      }>(`/api/local-first/mutations?${query(input.budgetId, {
        syncEpoch: input.syncEpoch,
        afterCursor: input.afterCursor,
        limit: input.limit ?? 500,
      })}`);
    },
  };
}

async function sha256(content: Uint8Array): Promise<string> {
  // Copy to an ArrayBuffer-backed view. Callers may provide a view whose type
  // permits SharedArrayBuffer, while SubtleCrypto deliberately requires a
  // non-shared BufferSource.
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(content).buffer,
  );
  return `sha256:${Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0")).join("")}`;
}
