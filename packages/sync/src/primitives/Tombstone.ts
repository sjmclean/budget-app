import {
  compareHybridTimestamps,
  type HybridTimestamp,
} from "./HybridTimestamp.js";

export type Tombstone = HybridTimestamp | null;

export function mergeTombstones(left: Tombstone, right: Tombstone): Tombstone {
  if (!left) return right;
  if (!right) return left;
  return compareHybridTimestamps(left, right) >= 0 ? left : right;
}

export function isTombstoned(tombstone: Tombstone): boolean {
  return tombstone !== null;
}
