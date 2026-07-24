# Local-first persistence migration

**Status:** Milestone 1 complete; Milestone 2 ready for design and implementation  
**Working baseline:** Budget App 1.2.15  
**Last reviewed:** 2026-07-24

This is the living engineering specification for moving Budget App to an Actual-style local-first architecture while preserving Budget App's product model, workflows, and user interface.

The generated persistence inventory is maintained separately in [`persistence-audit-phase-1.md`](./persistence-audit-phase-1.md), with machine-readable output in [`persistence-audit.json`](./persistence-audit.json). Refresh both with `pnpm audit:persistence`.

## 1. Product and architecture decision

Budget App remains the application. We retain its register, importer, tags, attachments, reports, scheduled transactions, transaction matching, and package workflows.

Actual Budget is an architectural reference only. We are adopting the useful infrastructure principles:

- local data is authoritative;
- SQLite is the durable local database;
- mutations produce ordered operations;
- checkpoints provide compact recovery points;
- the server transports operations and blobs rather than serving as the live application database;
- devices can continue operating while offline.

This migration must not require product features to understand whether a budget is offline, synchronising, or connected to a server.

## 2. Current architecture

### 2.1 Runtime topology

```text
React UI
  ↓
Feature services and persistence ports
  ↓
BudgetPersistenceProvider / AppPersistenceGateway
  ├─ browser-local-storage (default)
  └─ shared-server (optional deployment mode)
       ↓ HTTP key/value batches and snapshot reads
Shared Platform server
       ↓
shared-budget.sqlite
```

SQLite domain adapters already exist for accounts, payees, and substantial register behaviour, but the browser runtime does not currently select them as its authoritative provider.

### 2.2 Browser-local mode

The browser-local provider stores authoritative budget state in browser storage. The generic key/value layer may spill larger values into IndexedDB. Some feature modules still access `localStorage` directly. UI-only preferences also use `localStorage`; those uses are legitimate and should remain separate from budget authority.

Consequences:

- the budget is authoritative only in that browser profile;
- there is no unified SQLite transaction boundary;
- direct storage calls can bypass repository-level invariants;
- synchronisation cannot be expressed as domain operations.

### 2.3 Shared-server mode

Shared-server mode replaces the browser provider with a server-authoritative key/value namespace. Clients send key-level set/remove batches with an expected global revision. The server commits the batch, increments the revision, and broadcasts invalidation through server-sent events.

Consequences:

- the server is the live source of truth;
- a revision conflict rejects a complete batch;
- clients reload current state rather than replaying ordered domain operations;
- offline operation is limited by server availability;
- the server SQLite file is a key/value snapshot store, not the future local-first database model.

### 2.4 Existing SQLite foundation

Budget App already contains SQLite gateways and feature adapters. These are useful migration seams rather than disposable experiments. Before activation they need:

- complete feature coverage;
- one transaction boundary for multi-entity writes;
- schema and migration ownership;
- provider parity tests;
- a browser or host runtime capable of durable SQLite access;
- import and rollback safeguards for existing budgets.

### 2.5 Attachments

Attachment metadata remains associated with register data. New attachment bytes are separated behind an attachment content-store boundary and stored independently from the register snapshot.

The target keeps this separation:

```text
SQLite
  └─ attachment metadata, hashes, transaction links

Attachment content store
  └─ immutable binary blobs
```

Remote blob transfer, manifests, garbage collection, checkpoint integration, and lazy download remain later milestones.

## 3. Target architecture

```text
React UI
  ↓
Application services
  ↓
Repositories
  ↓
Local transaction coordinator
  ├─ SQLite database (authoritative)
  ├─ operation journal
  └─ attachment metadata
       ↓
Sync engine
  ├─ ordered operation exchange
  ├─ checkpoint upload/download
  └─ content-addressed blob transfer
       ↓
Checkpoint / operation / blob server
```

### 3.1 Authority rules

1. SQLite is the authoritative state on every device.
2. A completed local transaction is visible immediately without server acknowledgement.
3. Every synchronisable mutation records an operation in the same local transaction as the state change.
4. The server never becomes the UI's direct persistence provider.
5. Remote operations are applied through the same domain and transaction rules as local operations.
6. Checkpoints accelerate bootstrap and recovery but do not replace the operation history needed after the checkpoint boundary.
7. Attachment bytes are immutable blobs addressed by hash; SQLite stores metadata and references only.

### 3.2 Planned local package

Desktop and package-capable runtimes should converge on:

```text
Budget Package/
  budget.db
  Attachments/
  Backups/
  Temp/
```

Browser runtimes may use OPFS and IndexedDB while presenting the same repository and content-store contracts.

## 4. Migration principles

- **No big-bang rewrite.** Each milestone must build, preserve existing workflows, and support rollback.
- **UI remains stable.** Infrastructure changes should not redesign product behaviour.
- **One authority at a time.** Shared-server and SQLite must not both accept independent authoritative writes.
- **Compatibility before deletion.** Existing browser and shared budgets must be exportable and recoverable before legacy paths are removed.
- **Contract parity.** Repository behaviour must be tested against the old provider and SQLite during migration.
- **Observable migration.** Activation must expose diagnostics, schema version, provider, and recovery status.
- **Binary separation.** Attachment content never becomes SQLite blob payload or operation-log payload.

## 5. Milestones and progress

### Milestone 1 — Foundation — **complete**

- [x] One-command development startup with `pnpm dev`.
- [x] Separate `pnpm dev:web` and `pnpm dev:server` commands retained.
- [x] Repeatable persistence scanner with `pnpm audit:persistence`.
- [x] Audit freshness check with `pnpm audit:persistence:check`.
- [x] Current architecture documented.
- [x] Target architecture documented.
- [x] Migration constraints, sequencing, rollback, and test strategy documented.
- [x] Living document validation with `pnpm docs:architecture:check`.

**Exit condition:** the current persistence topology and target direction are explicit, reproducible, and reviewable. Met.

### Milestone 2 — Authoritative local SQLite — **next**

Goal: make SQLite the single local source of truth without changing visible application workflows.

Planned slices:

1. Select and document the browser/host SQLite runtime.
2. Inventory schema and adapter gaps by feature port.
3. Introduce a local transaction coordinator.
4. Add repository contract suites that run against legacy and SQLite providers.
5. Add migration preview and safety checkpoint/export.
6. Import existing browser-local data into SQLite.
7. Activate SQLite behind an explicit feature flag.
8. Validate parity, recovery, and restart persistence.
9. Make SQLite the default authority.
10. Retain legacy read-only recovery for one release window before removal.

**Exit condition:** all active budget reads and writes use local SQLite; the app remains usable with the server stopped; shared-server code no longer acts as the live application database.

### Milestone 3 — Operation journal

**Status:** local journal foundation and transport replay implemented. Domain-specific conflict policy remains deferred.

- [x] Define a versioned operation envelope, persistent device identity, sequence, and operation IDs.
- [x] Record each local state mutation and its operation atomically.
- [x] Expose cursor-based ordered journal reads through the persistence provider.
- [x] Preserve legacy providers without falsely advertising journal support.
- [x] Apply operations received from another device deterministically without creating new local journal entries.
- [x] Add duplicate-delivery protection and server-assigned remote ordering.
- [ ] Add full browser multi-device convergence and failure-injection tests.

See [Operation journal](./operation-journal.md) for the durability invariant and current operation vocabulary.

### Milestone 4 — Checkpoints

**Status:** local checkpoint, recovery, and remote checkpoint exchange implemented.

- [x] Define checkpoint metadata, integrity verification, and compatibility rules.
- [x] Create checkpoints at an exact local journal boundary.
- [x] Bootstrap/recover canonical state from checkpoint plus later operations atomically.
- [x] Retain the five newest checkpoints and document safe journal-pruning constraints.
- [x] Exchange checkpoints through generation-aware synchronisation transport.
- [ ] Prune acknowledged journal history after server/device recovery guarantees exist.

See [Checkpoints](./checkpoints.md) for the recovery invariant and retention policy.

### Milestone 5 — Replication engine

**Status:** replication protocol, transport, server storage, durable cursors, idempotent push, ordered pull, and checkpoint exchange implemented.

- [x] Replace shared key/value authority with a separate operation-exchange API.
- [x] Add generation management and durable client cursors.
- [x] Support idempotent upload and safe retry after interruption.
- [x] Add ordered pull and remote replay without journal echo.
- [x] Add remote checkpoint upload/download and generation recovery.
- [ ] Add automatic/background scheduling and user-facing controls.
- [ ] Add authentication, per-budget authorization, and full convergence/failure tests.

See [Replication engine](./replication-engine.md) for protocol invariants and deferred work.

### Milestone 6 — Background synchronisation and sync UX

**Status:** implemented.

- [x] Start replication automatically after persistence initialisation.
- [x] Batch local writes, periodically sync, retry with backoff, and reconnect after offline periods.
- [x] Expose shared status and manual sync/checkpoint controls.

### Milestone 7 — Attachment blob synchronisation

**Status:** content-addressed upload/download and integrity verification implemented.

- [x] Add a generation-aware content-addressed remote blob API.
- [x] Upload local blobs independently before publishing attachment metadata operations.
- [x] Download missing referenced blobs after applying remote state.
- [x] Verify SHA-256 on both server upload and client download.
- [x] Keep binary content out of operations and checkpoints.
- [ ] Add safe remote garbage collection after checkpoint/device acknowledgement exists.
- [ ] Add resumable transfer and remote encryption.

See [Attachment blob replication](./attachment-blob-replication.md).

### Milestone 8 — Conflict handling and hardening

- Define field/entity conflict policies.
- Surface conflicts requiring user choice.
- Add corruption recovery, observability, performance budgets, and release migration tooling.

## 6. Milestone 2 design decisions to resolve

The following are intentionally not guessed in Milestone 1:

### 6.1 Browser SQLite runtime

Candidates include an OPFS-backed WebAssembly SQLite runtime and a host-provided SQLite gateway. Selection criteria:

- durable transactions and crash recovery;
- browser and desktop compatibility;
- worker support and UI responsiveness;
- backup/export capability;
- migration support;
- library maintenance and licensing;
- predictable behaviour on supported browsers.

### 6.2 Database ownership

We must define:

- schema version source of truth;
- migration runner ownership;
- transaction coordinator interface;
- repository construction and lifecycle;
- database open/close/recovery semantics;
- handling of multiple tabs or processes.

### 6.3 Existing data migration

Migration must be resumable and non-destructive:

1. inspect legacy state;
2. create an export/safety checkpoint;
3. populate a new SQLite database;
4. validate entity counts and invariants;
5. switch authority only after validation;
6. retain the legacy source until the new database has reopened successfully;
7. provide an explicit rollback path.

## 7. Test strategy

Milestone 2 must add tests at four levels.

### Repository contracts

The same behavioural suite runs against the legacy provider and SQLite. It covers reads, creates, updates, deletes, ordering, identifiers, and expected error behaviour.

### Transactional integration

Tests prove that multi-entity mutations either commit completely or leave no partial state. Restart tests prove durability.

### Migration verification

Fixtures representing browser-local and shared-server budgets are migrated, reopened, and compared for counts, balances, scheduled transactions, splits, tags, importer metadata, and attachment metadata.

### Product regression

Existing feature tests and the web build remain required. Server-offline browser tests verify that normal local work continues without the sync service.

## 8. Rollback strategy

Until SQLite authority is proven:

- activation remains feature-flagged;
- migration creates a safety export before writing;
- legacy data is not deleted during activation;
- failed validation leaves the current provider unchanged;
- the new database is replaceable from the safety export;
- provider and migration diagnostics are visible to developers;
- release notes identify the rollback window and compatibility limits.

Once SQLite is the default, rollback means restoring a checkpoint into SQLite—not returning to server authority.

## 9. Definition of done for every milestone

A milestone is complete only when:

- the project builds;
- required tests pass;
- existing product workflows remain functional;
- new architecture has automated coverage;
- migration and rollback paths are documented;
- generated audits and living documentation are current;
- the repository is left in a releasable state.

## 10. Working commands

```bash
# Start web and server together
pnpm dev

# Refresh the generated persistence inventory
pnpm audit:persistence

# Verify the inventory is current
pnpm audit:persistence:check

# Validate required architecture documentation
pnpm docs:architecture:check
```

## 11. Change-control rule

Any change that alters persistence authority, repository boundaries, sync semantics, checkpoint format, attachment storage, or migration sequencing must update this document in the same change. Generated inventory changes must be refreshed with `pnpm audit:persistence`.
