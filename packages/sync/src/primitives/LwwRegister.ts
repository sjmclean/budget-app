import {
  compareHybridTimestamps,
  type HybridTimestamp,
} from "./HybridTimestamp.js";

export type LwwRegister<T> = Readonly<{
  value: T;
  timestamp: HybridTimestamp;
}>;

export function createLwwRegister<T>(
  value: T,
  timestamp: HybridTimestamp,
): LwwRegister<T> {
  return Object.freeze({ value, timestamp });
}

function stableValueKey(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `string:${value}`;
  if (typeof value === "number") return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (typeof value === "undefined") return "undefined";
  if (Array.isArray(value)) return `array:[${value.map(stableValueKey).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `object:{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValueKey(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("LWW register values must be deterministically serialisable.");
}

export function mergeLwwRegisters<T>(
  left: LwwRegister<T>,
  right: LwwRegister<T>,
): LwwRegister<T> {
  const timestampOrder = compareHybridTimestamps(left.timestamp, right.timestamp);
  if (timestampOrder < 0) return right;
  if (timestampOrder > 0) return left;

  // A timestamp should uniquely identify a write. This tie-breaker keeps merge
  // deterministic even if malformed peers reuse the same timestamp.
  return stableValueKey(left.value) < stableValueKey(right.value) ? right : left;
}
