import type { PersistenceCheckpoint } from "./checkpoint";
import type { OperationJournalEntry } from "./operationJournal";
import {
  REPLICATION_PROTOCOL_VERSION,
  type ReplicationPullResult,
  type ReplicationPushResult,
  type ReplicationRemoteGeneration,
  type ReplicationTransport,
  type ReplicationBlobDescriptor,
} from "./replication";
import { serialiseReplicationPushPayload } from "./replicationPushBatch";

export interface HttpReplicationTransportOptions {
  readonly budgetId: string;
  readonly baseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
}

export function createHttpReplicationTransport(
  options: HttpReplicationTransportOptions,
): ReplicationTransport {
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const budgetId = options.budgetId.trim();
  if (!budgetId) throw new Error("A budgetId is required for replication.");

  return {
    getGeneration: () => requestJson<ReplicationRemoteGeneration>(scoped("/api/replication/generation")),

    pushOperations: (generationId, operations) =>
      requestJson<ReplicationPushResult>(scoped("/api/replication/operations/push"), {
        method: "POST",
        body: serialiseReplicationPushPayload(generationId, operations),
      }),

    pullOperations: (generationId, afterCursor, limit = 500) => {
      const query = new URLSearchParams({
        budgetId,
        generationId,
        afterCursor: String(afterCursor),
        limit: String(limit),
      });
      return requestJson<ReplicationPullResult>(`/api/replication/operations/pull?${query}`);
    },

    uploadCheckpoint: async (generationId, checkpoint) => {
      return await requestJson<{ checkpointId: string; acknowledgedThroughSequence: number; integrityHash: string; replicatedThroughCursor: number }>(scoped("/api/replication/checkpoints"), {
        method: "POST",
        body: JSON.stringify({
          protocolVersion: REPLICATION_PROTOCOL_VERSION,
          generationId,
          checkpoint,
        }),
      });
    },

    getLatestCheckpoint: async (generationId) => {
      const response = await fetchImplementation(
        `${baseUrl}/api/replication/checkpoints/latest?${new URLSearchParams({ budgetId, generationId })}`,
        { credentials: "include", headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw await createResponseError(response);
      const payload = (await response.json()) as {
        checkpoint: PersistenceCheckpoint | null;
      };
      return payload.checkpoint ?? null;
    },

    hasBlob: async (generationId, contentHash) => {
      const response = await fetchImplementation(blobUrl(generationId, contentHash), {
        method: "HEAD",
        credentials: "include",
      });
      if (response.status === 404) return false;
      if (!response.ok) throw await createResponseError(response);
      return true;
    },

    uploadBlob: async (
      generationId: string,
      descriptor: ReplicationBlobDescriptor,
      content: Blob,
    ) => {
      const response = await fetchImplementation(blobUrl(generationId, descriptor.contentHash), {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": descriptor.mimeType || "application/octet-stream",
          "Content-Length": String(descriptor.size),
        },
        body: content,
      });
      if (!response.ok) throw await createResponseError(response);
    },

    downloadBlob: async (generationId, contentHash) => {
      const response = await fetchImplementation(blobUrl(generationId, contentHash), {
        credentials: "include",
        headers: { Accept: "application/octet-stream" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw await createResponseError(response);
      return await response.blob();
    },
  };

  function blobUrl(generationId: string, contentHash: string): string {
    const encodedHash = encodeURIComponent(contentHash);
    return `${baseUrl}/api/replication/blobs/${encodedHash}?${new URLSearchParams({ budgetId, generationId })}`;
  }

  function scoped(path: string): string {
    return `${path}?${new URLSearchParams({ budgetId })}`;
  }

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImplementation(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw await createResponseError(response);
    return (await response.json()) as T;
  }
}

async function createResponseError(response: Response): Promise<Error> {
  let message = `Replication request failed with HTTP ${response.status}.`;
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) message = payload.message;
  } catch {
    // Preserve the status-based fallback.
  }
  return new Error(message);
}
