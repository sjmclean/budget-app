export type ServerOperationalStatus = "unknown" | "checking" | "ready" | "unavailable";

export interface ServerReadinessSnapshot {
  readonly status: "ready";
  readonly service: string;
  readonly storage: string;
  readonly protocolVersion: number;
  readonly generationId: string;
  readonly revision: number;
  readonly serverTime: string;
}

export interface ServerOperationalHealthResult {
  readonly status: ServerOperationalStatus;
  readonly checkedAt: string;
  readonly latencyMs: number | null;
  readonly readiness: ServerReadinessSnapshot | null;
  readonly error: string | null;
}

export async function checkServerOperationalHealth(options: {
  readonly baseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
} = {}): Promise<ServerOperationalHealthResult> {
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchImplementation(`${baseUrl}/api/ready`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Server readiness check failed with HTTP ${response.status}.`);
    }
    const readiness = (await response.json()) as ServerReadinessSnapshot;
    if (readiness.status !== "ready" || typeof readiness.generationId !== "string") {
      throw new Error("Server returned an invalid readiness response.");
    }
    return {
      status: "ready",
      checkedAt,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      readiness,
      error: null,
    };
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? `Server readiness check timed out after ${timeoutMs}ms.`
      : error instanceof Error
        ? error.message
        : "Server readiness check failed.";
    return {
      status: "unavailable",
      checkedAt,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      readiness: null,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
