import type { RestorePointMetadata } from "./restorePointTypes";

export const RESTORE_POINT_INTERVAL_MS = 10 * 60 * 1_000;
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

/** Calendar buckets are UTC and tier-prefixed so boundary tiers cannot collide. */
function timedBucket(point: RestorePointMetadata, now: number): string {
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

function classifyRestorePoint(point: RestorePointMetadata): "timed" | "event" | "protected" {
  if (point.reason === "manual" || point.reason === "initial-import") return "protected";
  return point.reason === "timed" ? "timed" : "event";
}

/** Recent safety events all survive; older events thin independently of timed points. */
function eventBucket(point: RestorePointMetadata, now: number): string | null {
  const timestamp = Date.parse(point.createdAt);
  const age = Math.max(0, now - timestamp);
  if (age < DAY) return null;
  if (age < 7 * DAY) return `day:${Math.floor(timestamp / DAY)}`;
  if (age < 35 * DAY) return `week:${Math.floor((timestamp + 3 * DAY) / (7 * DAY))}`;
  const date = new Date(timestamp);
  return `month:${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

export function retainRestorePoints(points: readonly RestorePointMetadata[], now: number) {
  const retained: RestorePointMetadata[] = [];
  const pruned: RestorePointMetadata[] = [];
  const seen = new Set<string>();
  for (const point of [...points].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))) {
    const retentionClass = classifyRestorePoint(point);
    const bucket = retentionClass === "timed" ? timedBucket(point, now)
      : retentionClass === "event" ? eventBucket(point, now) : null;
    // Tuple encoding keeps arbitrary budget IDs and retention classes independent.
    const key = JSON.stringify([point.budgetId, retentionClass, bucket]);
    if (bucket === null || !seen.has(key)) {
      retained.push(point);
      if (bucket !== null) seen.add(key);
    } else {
      pruned.push(point);
    }
  }
  return { retained, pruned };
}
