# Local-first persistence migration history

**Status:** Historical migration record; the provider migration is complete.

**Original planning baseline:** Budget App 1.2.15

**Current-status review:** 2026-09-11

This file is retained as historical design context. It is no longer the canonical description
of the current runtime architecture. Use
[`../application-architecture.md`](../application-architecture.md),
[`../persistence-and-sync.md`](../persistence-and-sync.md), and the
[`architecture index`](./README.md) for current contracts.

## Original objective

The migration replaced browser-key/value and server-authoritative persistence
modes with an Actual-style local-first architecture while preserving Budget
App's workflows and financial model. Its governing decisions were:

- browser-side SQLite becomes the interactive authority;
- local transactions complete before server acknowledgement;
- synchronizable writes record durable ordered mutations;
- the server coordinates epochs, baselines, mutations, blobs, and access rather
  than serving live budget-domain reads and writes;
- staged replacement and integrity verification protect imports and recovery;
- attachment content remains separate from SQLite metadata and mutation payloads.

The generated persistence inventory is maintained in
[`persistence-audit-phase-1.md`](./persistence-audit-phase-1.md) and
[`persistence-audit.json`](./persistence-audit.json).

## Completed migration sequence

The historical work progressed through these broad stages:

1. Persistence contracts and an inventory of browser and hosted storage.
2. Worker-backed authoritative SQLite with staged legacy-data import.
3. Durable mutation journaling and ordered remote application.
4. Checkpoint/baseline transfer, generation and epoch recovery.
5. Background synchronization, conflict handling, and attachment-blob transfer.
6. Removal of selectable browser-local and shared-server authority modes.
7. Recoverable authoritative restore and new-epoch isolation.

The old mode names still appear in ADRs, removal records, tests, and generated
audit context because they explain migration history. They are not selectable
production configurations. `VITE_BUDGET_PERSISTENCE_MODE` is not consumed by
the current runtime.

## Superseded planning assumptions

The original plan treated SQLite activation, background synchronization,
authentication, authorization, conflicts, and relay recovery as future
milestones. Those statements are superseded. The current runtime constructs one
local-database provider in `configuredPersistenceProvider.ts`; the server's
retired hosted budget-domain endpoints return HTTP 410.

Rollback no longer means selecting an earlier persistence provider. Recovery is
performed through validated SQLite backups, internal restore points, baselines,
and epoch transitions. See [`sqlite-restore-points.md`](./sqlite-restore-points.md)
and [`../operations-and-recovery.md`](../operations-and-recovery.md).

## Remaining work is not a migration mode

Ongoing hardening may add deeper failure injection, performance evidence,
operational tooling, or protocol improvements. Such work extends the current
local-first architecture; it does not reopen the removed provider-selection
design.
