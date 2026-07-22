export interface SharedServerStorageSnapshot {
  revision: number;
  entries: Record<string, string>;
}

export type SharedServerStorageOperation =
  | { type: "set"; key: string; value: string }
  | { type: "remove"; key: string };

export interface SharedServerStorageWriteResult {
  revision: number;
}

export interface SharedServerStorageBootstrapResult {
  revision: number;
  importedKeys: number;
}

export interface SharedServerHealthResult {
  status: string;
  storage: string;
  revision: number;
}

export interface SharedServerStorageClient {
  loadSnapshot(): Promise<SharedServerStorageSnapshot>;
  applyOperations(
    operations: readonly SharedServerStorageOperation[],
  ): Promise<SharedServerStorageWriteResult>;
  bootstrap(
    entries: Readonly<Record<string, string>>,
  ): Promise<SharedServerStorageBootstrapResult>;
  getHealth(): Promise<SharedServerHealthResult>;
}

export interface SharedServerStorageClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createSharedServerStorageClient(
  options: SharedServerStorageClientOptions = {},
): SharedServerStorageClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  if (typeof fetchImplementation !== "function") {
    throw new Error("Fetch is not available for shared budget persistence.");
  }

  const baseUrl = normaliseBaseUrl(options.baseUrl ?? "");

  async function requestJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetchImplementation(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      const message = getErrorMessage(body) ??
        `Shared budget request failed with status ${response.status}.`;
      throw new SharedServerStorageError(message, response.status, body);
    }

    return body as T;
  }

  return {
    async loadSnapshot() {
      const result = await requestJson<unknown>("/api/shared-budget/storage");
      return parseSnapshot(result);
    },

    async applyOperations(operations) {
      const result = await requestJson<unknown>(
        "/api/shared-budget/storage/batch",
        {
          method: "POST",
          body: JSON.stringify({ operations }),
        },
      );
      return parseWriteResult(result);
    },

    async bootstrap(entries) {
      const result = await requestJson<unknown>(
        "/api/shared-budget/storage/bootstrap",
        {
          method: "POST",
          body: JSON.stringify({ entries }),
        },
      );
      return parseBootstrapResult(result);
    },

    async getHealth() {
      const result = await requestJson<unknown>("/api/health");
      return parseHealthResult(result);
    },
  };
}

export class SharedServerStorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "SharedServerStorageError";
  }
}

function normaliseBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(value: unknown): string | null {
  if (!isRecord(value) || typeof value.message !== "string") {
    return null;
  }

  return value.message;
}

function parseSnapshot(value: unknown): SharedServerStorageSnapshot {
  if (!isRecord(value) || !isRevision(value.revision) || !isRecord(value.entries)) {
    throw new Error("Shared budget server returned an invalid storage snapshot.");
  }

  const entries: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(value.entries)) {
    if (typeof entryValue !== "string") {
      throw new Error(`Shared budget storage entry ${key} is not a string.`);
    }
    entries[key] = entryValue;
  }

  return {
    revision: value.revision,
    entries,
  };
}

function parseWriteResult(value: unknown): SharedServerStorageWriteResult {
  if (!isRecord(value) || !isRevision(value.revision)) {
    throw new Error("Shared budget server returned an invalid write result.");
  }

  return { revision: value.revision };
}

function parseBootstrapResult(value: unknown): SharedServerStorageBootstrapResult {
  if (
    !isRecord(value) ||
    !isRevision(value.revision) ||
    !Number.isInteger(value.importedKeys) ||
    (value.importedKeys as number) < 0
  ) {
    throw new Error("Shared budget server returned an invalid bootstrap result.");
  }

  return {
    revision: value.revision,
    importedKeys: value.importedKeys as number,
  };
}

function parseHealthResult(value: unknown): SharedServerHealthResult {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    typeof value.storage !== "string" ||
    !isRevision(value.revision)
  ) {
    throw new Error("Shared budget server returned an invalid health response.");
  }

  return {
    status: value.status,
    storage: value.storage,
    revision: value.revision,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
