# Hosted SQLite operational resilience

The hosted server ensures a verified whole-database SQLite backup exists at
startup and every six hours by default. A startup within one hour of the newest
verified backup reuses that recovery point instead of copying the database
again. Backups are written to a temporary file using
SQLite's online backup API, opened read-only, and accepted only after
`PRAGMA quick_check` returns `ok`. A sidecar manifest records the reason,
timestamp, size, and verification result. The newest seven verified backups
are retained by default.

Routine retention is bounded by both count and bytes. The defaults retain at
most three backups and 10 GiB, while reserving at least 2 GiB of filesystem
capacity. Obsolete backups are pruned before allocation, but at least one
verified recovery point is preserved until its replacement succeeds. If there
still is not enough room for the database plus the reserve, the routine backup
is skipped and reported through recovery diagnostics; the server remains
available. Mandatory pre-migration backups are never silently skipped.

Abandoned `.partial`, WAL, shared-memory, and journal sidecars from interrupted
routine backups are removed before the next backup attempt.

Before normal startup, the primary database receives bounded header, schema,
and catalogue reads. A full synchronous page scan is deliberately not placed
in front of the HTTP listener because large budgets must not make the service
appear unavailable. If the database cannot be opened or those structural
reads fail, the newest independently verified backup is copied into place.
The damaged database is preserved with a
`.corrupt-<timestamp>` suffix for investigation. WAL and shared-memory files
from the damaged database are not reused.

Staged, validated, and cancelled import generations which are not active are
removed after 24 hours by default. Cleanup deletes relational generation rows
and their session in one SQLite transaction; active generations are excluded.

Authorized users can inspect their budget's recovery state at:

```text
GET /api/budget-engine/budgets/:budgetId/recovery
```

Diagnostics report database integrity, active generation, backup availability,
the last backup or cleanup result, abandoned-generation count, and whether
startup recovery occurred. Filesystem paths remain hidden unless the existing
path-exposure setting is enabled.

Configuration:

- `BUDGET_APP_OPERATIONAL_BACKUP_DIR`
- `BUDGET_APP_OPERATIONAL_BACKUP_INTERVAL_MS`
- `BUDGET_APP_OPERATIONAL_BACKUP_RETENTION`
- `BUDGET_APP_OPERATIONAL_BACKUP_MAXIMUM_BYTES`
- `BUDGET_APP_OPERATIONAL_BACKUP_MINIMUM_FREE_BYTES`
- `BUDGET_APP_OPERATIONAL_BACKUP_RECENT_MAXIMUM_AGE_MS`
- `BUDGET_APP_ABANDONED_IMPORT_MAXIMUM_AGE_MS`
