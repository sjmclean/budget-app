import { useSyncExternalStore } from "react";

export type PersistenceChangeSource =
  | "local"
  | "replication"
  | "shared-server"
  | "restore";

export interface PersistenceChangeEvent {
  readonly source: PersistenceChangeSource;
  readonly changedKeys?: readonly string[];
  readonly occurredAt: string;
}

let version = 0;
let lastEvent: PersistenceChangeEvent | null = null;
const listeners = new Set<() => void>();

export function publishPersistenceChange(
  input: Omit<PersistenceChangeEvent, "occurredAt"> & { readonly occurredAt?: string },
): void {
  lastEvent = {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribePersistenceChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPersistenceChangeVersion(): number {
  return version;
}

export function getLastPersistenceChange(): PersistenceChangeEvent | null {
  return lastEvent;
}

export function usePersistenceChangeVersion(): number {
  return useSyncExternalStore(
    subscribePersistenceChanges,
    getPersistenceChangeVersion,
    getPersistenceChangeVersion,
  );
}
