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

export interface HttpReplicationTransportOptions {
  readonly baseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
}

export function createHttpReplicationTransport(
  options: HttpReplicationTransportOptions = {},
): ReplicationTransport {
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  const fetchImplementation = options.fetchImplementation ?? fetch;

  return {
    getGeneration: () => requestJson<ReplicationRemoteGeneration>("/api/replication/generation"),

    pushOperations: (generationId, operations) =>
      requestJson<ReplicationPushResult>("/api/replication/operations/push", {
        method: "POST",
        body: JSON.stringify({
          protocolVersion: REPLICATION_PROTOCOL_VERSION,
          generationId,
          operations,
        }),
      }),

    pullOperations: (generationId, afterCursor, limit = 500) => {
      const query = new URLSearchParams({
        generationId,
        afterCursor: String(afterCursor),
        limit: String(limit),
      });
      return requestJson<ReplicationPullResult>(`/api/replication/operations/pull?${query}`);
    },

    uploadCheckpoint: async (generationId, checkpoint) => {
      return await requestJson<{ checkpointId: string; acknowledgedThroughSequence: number }>("/api/replication/checkpoints", {
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
        `${baseUrl}/api/replication/checkpoints/latest?${new URLSearchParams({ generationId })}`,
        { headers: { Accept: "application/json" } },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw await createResponseError(response);
      const payload = (await response.json()) as { checkpoint: PersistenceCheckpoint };
      return payload.checkpoint;
    },

    hasBlob: async (generationId, contentHash) => {
      const response = await fetchImplementation(blobUrl(generationId, contentHash), {
        method: "HEAD",
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
        headers: { Accept: "application/octet-stream" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw await createResponseError(response);
      return await response.blob();
    },
  };

  function blobUrl(generationId: string, contentHash: string): string {
    const encodedHash = encodeURIComponent(contentHash);
    return `${baseUrl}/api/replication/blobs/${encodedHash}?${new URLSearchParams({ generationId })}`;
  }

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImplementation(`${baseUrl}${path}`, {
      ...init,
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
