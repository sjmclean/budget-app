interface RuntimeCrypto {
  randomUUID?: unknown;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

/** Browser-safe UUID generation for insecure contexts and older Web Crypto APIs. */
export function createRuntimeUuid(
  runtimeCrypto: RuntimeCrypto | undefined = globalThis.crypto,
): string {
  if (typeof runtimeCrypto?.randomUUID === "function") {
    return runtimeCrypto.randomUUID() as string;
  }

  if (typeof runtimeCrypto?.getRandomValues === "function") {
    const bytes = runtimeCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-` +
      `${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-` +
      hex.slice(10, 16).join("");
  }

  const time = Date.now().toString(16).padStart(12, "0").slice(-12);
  const random = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `${random.slice(0, 8)}-${random.slice(8, 12)}-4${random.slice(12, 15)}` +
    `-8${random.slice(15, 18)}-${random.slice(18)}${time.slice(0, 10)}`;
}
