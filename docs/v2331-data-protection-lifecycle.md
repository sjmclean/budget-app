# v2.33.1 Data Protection Lifecycle Integration

This release connects the v2.33.0 Version History foundation to meaningful application lifecycle events. It deliberately does not add user interface yet.

## Product decision

Version History remains separate from undo/redo:

- **Undo/redo** is command-level recovery for immediate mistakes.
- **Version History** is budget-wide recovery through rolling snapshots.
- **External backups** remain portable disaster-recovery files and are not part of this release.

## Lifecycle events

Automatic snapshots are created silently for these initial events:

1. **Budget switch** — when opening a different budget, Budget App snapshots the outgoing selected budget before switching.
2. **YNAB4 import completed** — after a successful launcher import, Budget App snapshots the newly imported active budget.

Opening the already-active budget is skipped so repeated launches do not create duplicate history entries.

## Retention

Version History continues to use the v2.33.0 rolling retention model:

- default maximum: 30 snapshots per budget
- automatic and manually named restore points participate in the same limit
- oldest snapshots are pruned first

## Architecture boundary

This release introduces `versionHistoryLifecycle.ts` as a small orchestration layer. It calls the Version History service but does not use or modify command history / undo-redo repositories.

That separation is intentional. The existing `CommandHistoryApplicationService`, `UndoRedoApplicationService`, `CommandHistoryRepository`, and related package-level history files remain reserved for future undo/redo workflows.

## UI status

No UI is added in this release. The next release can add Settings/Data/Version History once lifecycle creation is proven and tested.
