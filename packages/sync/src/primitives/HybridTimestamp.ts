export const DEFAULT_MAXIMUM_CLOCK_DRIFT_MS = 5 * 60 * 1000;

export class HybridClockDriftError extends Error {
  constructor(readonly observedWallTime: number, readonly now: number, readonly maximumDriftMs: number) {
    super(`Hybrid clock is ${observedWallTime - now}ms ahead of local time; maximum drift is ${maximumDriftMs}ms.`);
    this.name = "HybridClockDriftError";
  }
}

export type HybridTimestamp = Readonly<{
  wallTime: number;
  counter: number;
  nodeId: string;
}>;

function assertInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

export function createHybridTimestamp(
  wallTime: number,
  counter: number,
  nodeId: string,
): HybridTimestamp {
  assertInteger("wallTime", wallTime);
  assertInteger("counter", counter);
  if (nodeId.trim().length === 0) {
    throw new TypeError("nodeId must not be empty.");
  }

  return Object.freeze({ wallTime, counter, nodeId });
}

export function compareHybridTimestamps(
  left: HybridTimestamp,
  right: HybridTimestamp,
): -1 | 0 | 1 {
  if (left.wallTime !== right.wallTime) {
    return left.wallTime < right.wallTime ? -1 : 1;
  }
  if (left.counter !== right.counter) {
    return left.counter < right.counter ? -1 : 1;
  }
  if (left.nodeId === right.nodeId) return 0;
  return left.nodeId < right.nodeId ? -1 : 1;
}

export function tickHybridClock(
  previous: HybridTimestamp | undefined,
  now: number,
  nodeId: string,
  maximumDriftMs = DEFAULT_MAXIMUM_CLOCK_DRIFT_MS,
): HybridTimestamp {
  assertInteger("now", now);
  assertMaximumDrift(previous?.wallTime, now, maximumDriftMs);
  if (!previous) return createHybridTimestamp(now, 0, nodeId);

  const wallTime = Math.max(now, previous.wallTime);
  const counter = wallTime === previous.wallTime ? previous.counter + 1 : 0;
  return createHybridTimestamp(wallTime, counter, nodeId);
}

export function receiveHybridTimestamp(
  local: HybridTimestamp | undefined,
  remote: HybridTimestamp,
  now: number,
  nodeId: string,
  maximumDriftMs = DEFAULT_MAXIMUM_CLOCK_DRIFT_MS,
): HybridTimestamp {
  assertInteger("now", now);
  assertMaximumDrift(local?.wallTime, now, maximumDriftMs);
  assertMaximumDrift(remote.wallTime, now, maximumDriftMs);
  if (!local) {
    const wallTime = Math.max(now, remote.wallTime);
    const counter = wallTime === remote.wallTime ? remote.counter + 1 : 0;
    return createHybridTimestamp(wallTime, counter, nodeId);
  }

  const wallTime = Math.max(now, local.wallTime, remote.wallTime);
  let counter = 0;

  if (wallTime === local.wallTime && wallTime === remote.wallTime) {
    counter = Math.max(local.counter, remote.counter) + 1;
  } else if (wallTime === local.wallTime) {
    counter = local.counter + 1;
  } else if (wallTime === remote.wallTime) {
    counter = remote.counter + 1;
  }

  return createHybridTimestamp(wallTime, counter, nodeId);
}

export function serializeHybridTimestamp(timestamp: HybridTimestamp): string {
  return `${timestamp.wallTime}:${timestamp.counter}:${encodeURIComponent(timestamp.nodeId)}`;
}

export function parseHybridTimestamp(value: string): HybridTimestamp {
  const match = /^(\d+):(\d+):(.+)$/.exec(value);
  if (!match) throw new TypeError("Invalid hybrid timestamp.");

  return createHybridTimestamp(
    Number(match[1]),
    Number(match[2]),
    decodeURIComponent(match[3]),
  );
}

function assertMaximumDrift(
  observedWallTime: number | undefined,
  now: number,
  maximumDriftMs: number,
): void {
  assertInteger("maximumDriftMs", maximumDriftMs);
  if (observedWallTime !== undefined && observedWallTime - now > maximumDriftMs) {
    throw new HybridClockDriftError(observedWallTime, now, maximumDriftMs);
  }
}
