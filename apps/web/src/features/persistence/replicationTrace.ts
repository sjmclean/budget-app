import type { ReplicationTraceEvent } from "./replicationEngine";

const MAX_TRACE_EVENTS = 500;
const events: ReplicationTraceEvent[] = [];

/**
 * Records privacy-safe replication metadata for diagnostics. Mutation values
 * are deliberately excluded by ReplicationTraceEvent.
 */
export function recordReplicationTraceEvent(event: ReplicationTraceEvent): void {
  events.push(event);
  if (events.length > MAX_TRACE_EVENTS) {
    events.splice(0, events.length - MAX_TRACE_EVENTS);
  }
}

export function getReplicationTraceEvents(): readonly ReplicationTraceEvent[] {
  return [...events];
}

export function clearReplicationTraceEvents(): void {
  events.length = 0;
}

export function serialiseReplicationTraceEvents(): string {
  return `${JSON.stringify(events, null, 2)}\n`;
}
