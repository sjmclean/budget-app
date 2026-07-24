# Replication Engine

## Status

Milestone 5 establishes the first complete replication transport and engine boundary.
It does not yet schedule background replication or expose user-facing sync controls.

## Data flow

```text
Local authoritative database
  -> durable local operation journal
  -> replication engine
  -> HTTP replication transport
  -> SQLite replication server
```

The server assigns a monotonically increasing global cursor to accepted operations.
Clients retain two durable cursors: the highest local journal sequence pushed and the
highest remote cursor applied.

## Generations

A server generation identifies one coherent remote history. A client persists the
active generation ID. If that ID changes, the client requires a remote checkpoint
before adopting the replacement history. This avoids silently combining unrelated
operation streams.

## Idempotency

The server enforces uniqueness for both `(generation, operationId)` and
`(generation, deviceId, deviceSequence)`. Repeating a push is therefore safe.
Remote operation application does not create new local journal entries.

## Checkpoints

Clients may upload integrity-protected checkpoints. The server retains the five newest
checkpoints per generation. A later milestone will add checkpoint acknowledgement and
safe operation pruning.

## Deferred work

- automatic/background scheduling;
- authentication and per-budget authorization;
- encryption in transit payloads beyond HTTPS;
- conflict presentation and domain-specific merge policies;
- checkpoint acknowledgement and journal pruning;
- attachment blob replication.
