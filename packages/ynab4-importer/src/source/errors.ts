export class Ynab4SourceError extends Error {
  constructor(
    message: string,
    readonly sourceName: string,
    readonly collection: string | null,
    readonly offset: number,
    readonly kind: "syntax" | "schema" | "unsupported",
  ) {
    super(`${message} (${sourceName}${collection ? `, collection "${collection}"` : ""}, near byte ${offset})`);
    this.name = "Ynab4SourceError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (typeof DOMException === "function") {
    throw new DOMException("The YNAB4 source read was aborted.", "AbortError");
  }
  const error = new Error("The YNAB4 source read was aborted.");
  error.name = "AbortError";
  throw error;
}
