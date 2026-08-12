# Persistence and Synchronization

Budget App uses a local-first SQLite architecture.

The local database is the authoritative runtime store for budget data. The
server acts as a synchronization relay and hosted coordination service rather
than the primary interactive database.

## Local persistence

The browser persistence runtime owns:

- normalized budget and register data;
- budget assignments and policy facts;
- scheduled transactions;
- transaction tags and attachments;
- projection cache state;
- durable local mutation outbox;
- replication cursors and conflict state.

The local-first worker owns SQLite initialization, schema maintenance,
transactional mutation, projection invalidation, and baseline replacement.

## Synchronization

Synchronization uses per-budget epochs and a durable mutation stream.

The client:

1. commits mutations locally;
2. records durable outbox entries;
3. pushes mutations to the relay;
4. receives remote mutations;
5. applies them idempotently;
6. advances synchronization state.

## Baselines

Baselines provide complete state transfer for bootstrap and recovery.

Baseline publication and download include integrity validation. Replacing a
baseline clears obsolete local replication state so history from an earlier
state cannot be replayed into the replacement database.

## Sync epochs

A synchronization epoch identifies the currently valid history for a budget.

Operations that deliberately replace authoritative history, such as recovery or
restore workflows, must establish explicit epoch semantics rather than relying
on ordinary incremental replication.

## Server relay

The server stores local-first synchronization metadata including:

- sync epochs;
- baselines;
- baseline chunks;
- mutation streams;
- budget metadata.

The relay is not a second budgeting engine.

## Caches

Derived projection caches are disposable.

Canonical persisted facts must be sufficient to rebuild financial projections
without relying on cached results.
