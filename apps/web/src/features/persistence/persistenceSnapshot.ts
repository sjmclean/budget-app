import { isCanonicalPersistenceKey } from "./persistenceKeyClassification";
import type { KeyValueStoragePort } from "./keyValueStoragePort";

/**
 * Backwards-compatible name used by the current document replication code.
 * The classification policy itself lives in persistenceKeyClassification.ts.
 */
export const isCanonicalBudgetStorageKey = isCanonicalPersistenceKey;

export interface BudgetPersistenceSnapshot {
  readonly entries: Readonly<Record<string, string>>;
  readonly entryCount: number;
  readonly byteLength: number;
}

export function exportBudgetPersistenceSnapshot(
  storage: KeyValueStoragePort,
): BudgetPersistenceSnapshot {
  const entries: Record<string, string> = {};
  let byteLength = 0;

  for (const key of storage.listKeys?.() ?? []) {
    if (!isCanonicalBudgetStorageKey(key)) {
      continue;
    }

    const value = storage.getItem(key);
    if (value === null) {
      continue;
    }

    entries[key] = value;
    byteLength += utf8ByteLength(key) + utf8ByteLength(value);
  }

  return {
    entries,
    entryCount: Object.keys(entries).length,
    byteLength,
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
