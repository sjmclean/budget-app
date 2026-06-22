# v1.50.1 Budget Backup Schema Cleanup

## Purpose

v1.50.1 clarifies the backup/export format introduced in v1.49 and completed in v1.50.

The backup/restore feature is explicitly single-budget:

```text
One JSON backup file = one budget
Restore target = the currently selected budget only
```

It is not a multi-budget app backup and it is not a CSV transaction export.

## Schema Name

The current schema is now:

```text
budget-app.budget-backup.v1
```

The older v1.49/v1.50 schema name remains readable for compatibility:

```text
budget-app.data-export.v1
```

Legacy packages restore with a warning so users can understand that the old name is supported as a budget backup package.

## Records vs Diagnostic Snapshots

v1.49/v1.50 placed global settings and registry snapshots inside the same `records` array as budget-scoped data. Restore skipped them, but the package shape was confusing because `records` looked restorable.

v1.50.1 separates the two concepts:

```text
records = restorable budget-scoped records only
diagnosticSnapshots = global context snapshots only
```

Restore only processes `records`.

Diagnostic snapshots are for support, validation, and future tooling. They must not overwrite:

- Settings.
- Selected budget id.
- Budget registry.
- Other budgets.
- Global app preferences.

## JSON vs CSV

JSON remains the correct backup/restore format because a complete budget contains nested and related data:

- Accounts.
- Registers.
- Transactions.
- Splits.
- Payees.
- Categories and groups.
- Scheduled transactions.
- Budget month data.
- Metadata.

CSV should be added later for transaction/report export and bank-style import workflows. CSV is not suitable as the full backup format unless split across many separate files with additional relationship metadata.

## Validation

Run:

```bash
pnpm test:v1501
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```

`tests/v1501-budget-backup-schema-cleanup.ts` validates:

- Current packages use `budget-app.budget-backup.v1`.
- Restorable `records` are budget-scoped only.
- Global context is isolated under `diagnosticSnapshots`.
- `counts.storageRecords` counts restorable records only.
- Legacy `budget-app.data-export.v1` packages remain readable with a compatibility warning.
- Package notes clarify JSON backup versus future CSV export/import.
