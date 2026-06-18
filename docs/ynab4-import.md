# YNAB4 Import

YNAB4 import is implemented in `packages/ynab4-importer` and coordinated with repositories/application services.

## Import stages

1. Parse CSV/export data.
2. Detect known YNAB4 columns.
3. Preview accounts, category groups, categories, payees, transactions, splits, flags, notes, and budget months.
4. Produce issues/warnings.
5. Write records to SQLite inside a transaction for database imports.
6. Store `import_runs` and `import_maps` for traceability and rollback.

## Important files

- `parseCsv.ts` parses CSV content.
- `detectYnab4Columns.ts` detects column shapes.
- `mapYnab4Rows.ts` maps source rows into internal concepts.
- `importYnab4.ts` creates preview/report output.
- `Ynab4DatabaseImportService.ts` writes the import into SQLite.

## Import maps

Import maps link source entities to internal IDs. This is important for:

- Auditability.
- Import review.
- Rollback/undo.
- Debugging bad mappings.

## Transactions and rollback

Database-writing import is intended to be all-or-nothing. `better-sqlite3` transactions must be synchronous; do not use `async` callbacks inside `db.transaction()`.

Failed imports should not leave partial accounts/categories/transactions behind. Completed imports are tracked so they can be reviewed and, where supported, undone.

## YNAB4 edge cases to test with real data

- Old budgets with many years of history.
- Deleted/hidden categories.
- Transfers with renamed accounts.
- Split transactions with unusual totals.
- Missing payees or memo-only rows.
- Reconciled/cleared state quirks.
- Non-standard CSV encodings.
- Historic budget-month data.

## Bank import relationship

YNAB4 import is separate from bank import. Bank import handles CSV/QIF/OFX/QFX statement data, matching/deduplication, payee rules, and commit/undo batch workflows.
