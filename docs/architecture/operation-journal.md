# Operation journal

## Status

Milestone 3 foundation is implemented for the authoritative local database.

## Purpose

Every durable local mutation must have an ordered operation that can later be
sent to another device. The operation journal is not yet a sync engine; it is
the durable source stream the sync engine will consume.

## Durability rule

A local record mutation and its operation journal entry are committed in the
same IndexedDB transaction. Either both are durable or neither is durable.
This is the central safety invariant of this milestone.

## Identity and ordering

Each browser database owns a persistent device ID. Every operation receives:

- a globally unique operation ID;
- the persistent device ID;
- a monotonically increasing per-device sequence number;
- an ISO timestamp;
- a versioned mutation payload.

Sequence numbers, rather than timestamps, define ordering for a device.

## Current operation vocabulary

The present persistence layer is key/value-shaped, so the first journal format
records lossless storage mutations:

- `key-value.set` including key and complete value;
- `key-value.remove` including key.

This deliberately preserves exact replay semantics. Later milestones may add
higher-level domain operations while retaining format-version compatibility.

## Bootstrap and imports

`replaceAll` is a bootstrap/checkpoint operation and does not create thousands
of synthetic journal records. It is used for first-launch migration into an
empty database. A later checkpoint milestone will formally pair snapshots with
journal cursors.

## Public boundary

The configured local persistence provider exposes an optional
`operationJournal` port with:

- `getJournalCursor()`;
- `readJournal(afterSequence, limit)`.

Other providers do not claim journal support. This keeps capability detection
explicit and avoids pretending the legacy or shared-server providers have the
same guarantees.

## Deferred work

- uploading and acknowledging operations;
- pruning operations covered by checkpoints;
- applying operations from another device;
- generation IDs and reset handling;
- conflict resolution;
- content blob operations.
