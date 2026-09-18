# Architecture documentation

The canonical current architecture starts in
[`../application-architecture.md`](../application-architecture.md) and
[`../persistence-and-sync.md`](../persistence-and-sync.md).

## Current subsystem references

- [`attachment-blob-replication.md`](./attachment-blob-replication.md)
- [`background-synchronisation.md`](./background-synchronisation.md)
- [`checkpoints.md`](./checkpoints.md)
- [`operation-journal.md`](./operation-journal.md)
- [`reactive-persistence-updates.md`](./reactive-persistence-updates.md)
- [`replication-engine.md`](./replication-engine.md)
- [`sqlite-restore-points.md`](./sqlite-restore-points.md)
- [`undo-redo.md`](./undo-redo.md)

## Generated reports

- [`persistence-audit-phase-1.md`](./persistence-audit-phase-1.md) — generated human-readable persistence inventory.
- [`persistence-audit.json`](./persistence-audit.json) — generated machine-readable inventory.

Regenerate these only after persistence-source changes with
`pnpm audit:persistence`. Check freshness with `pnpm audit:persistence:check`.

## Historical migration and decisions

- [`local-first-migration.md`](./local-first-migration.md) — completed migration history, not a current runtime specification.
- [`milestone-2-local-database.md`](./milestone-2-local-database.md) — historical SQLite activation design.
- [`shared-server-removal.md`](./shared-server-removal.md) — removal record for the former hosted authority.
- [`persistence-cleanup-phase-3.md`](./persistence-cleanup-phase-3.md) — historical cleanup record.
- [`../adr/`](../adr/) — architecture decision records, including superseded decisions.

Run `pnpm docs:architecture:check` before committing documentation changes.
# Command and query paths

- Query: feature → `LocalBudgetQueryClient` → typed worker read → SQLite.
- Command: feature → `LocalBudgetEngine` → `LocalBudgetCommandExecutor` →
  typed internal domain handler → one SQLite worker atomic canonical-state plus
  outbox commit → `CommittedCommandHandlerResult` → one post-commit scoped
  invalidation → public domain result.
- Replication: relay → remote apply → SQLite commit → remote invalidation.
- Lifecycle: restore/reset/open/close stays outside the ordinary command API.

The 45 ordinary commands have distinct public facade functions and internal
handlers. Completion metadata flows through typed returns; no ordinary recorder
or callback side channel remains. Queries, conflict recovery (including
keep-local), replication, and lifecycle/control-plane paths remain separately
classified.

See `local-budget-engine-command-inventory.md` for the disposition of the 47
original mutation entry points.
