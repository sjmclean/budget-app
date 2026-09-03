import type { RestorePointMetadata } from "./restorePointTypes";

export const RESTORE_POINT_INTERVAL_MS = 10 * 60 * 1_000;
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

/** Calendar buckets are UTC and tier-prefixed so boundary tiers cannot collide. */
function bucket(point: RestorePointMetadata, now: number): string {
  const timestamp = Date.parse(point.createdAt);
  const age = Math.max(0, now - timestamp);
  const date = new Date(timestamp);
  if (age < 6 * HOUR) return `ten:${Math.floor(timestamp / RESTORE_POINT_INTERVAL_MS)}`;
  if (age < DAY) return `hour:${Math.floor(timestamp / HOUR)}`;
  if (age < 7 * DAY) return `day:${Math.floor(timestamp / DAY)}`;
  // Monday-anchored weeks, independent of the local timezone and DST.
  if (age < 35 * DAY) return `week:${Math.floor((timestamp + 3 * DAY) / (7 * DAY))}`;
  return `month:${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

export function retainRestorePoints(points: readonly RestorePointMetadata[], now: number) {
  const retained: RestorePointMetadata[] = [];
  const pruned: RestorePointMetadata[] = [];
  const seen = new Set<string>();
  for (const point of [...points].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))) {
    // Never let another budget, or a timed point, erase a semantic boundary.
    const key = `${point.budgetId}:${bucket(point, now)}`;
    if (point.reason !== "timed" || !seen.has(key)) {
      retained.push(point);
      if (point.reason === "timed") seen.add(key);
    } else {
      pruned.push(point);
    }
  }
  return { retained, pruned };
}
