# Architecture documentation

- [`local-first-migration.md`](./local-first-migration.md) — living specification, roadmap, migration and rollback plan.
- [`persistence-audit-phase-1.md`](./persistence-audit-phase-1.md) — generated human-readable persistence inventory.
- [`persistence-audit.json`](./persistence-audit.json) — generated machine-readable persistence inventory.
- [`undo-redo.md`](./undo-redo.md) — undo/redo architecture.

Run `pnpm audit:persistence` after persistence-related source changes and `pnpm docs:architecture:check` before committing architecture changes.

- [Attachment blob replication](./attachment-blob-replication.md)
