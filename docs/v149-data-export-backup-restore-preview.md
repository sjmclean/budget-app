# v1.49 Data Export, Backup, and Restore Preview

## Purpose

v1.49 turns the Settings > Data placeholders into a safe first data-management workflow.

The release provides:

- Export current budget to JSON.
- Backup current budget to JSON.
- Restore preview validation for a JSON export/backup.

Restore preview is intentionally non-destructive. It validates and summarises a package, but it does not overwrite app data.

## Why this release comes after v1.48

v1.48 established the budget data boundary. v1.49 uses that boundary so export and backup operate on the active budget only.

Switching budgets should feel like opening a different budget file, so the data package contains only the selected budget's scoped records plus a small number of global context snapshots.

## Export package

The v1.49 JSON package uses schema:

```text
budget-app.data-export.v1
```

The package includes:

- Schema and release metadata.
- Export kind: `export` or `backup`.
- Export timestamp.
- Active budget summary.
- Counts for accounts, registers, transactions, payees, scheduled transactions, and budget months.
- Budget-scoped storage records.
- Global settings and registry snapshots for future restore validation.

## Current storage boundary

The browser build still uses localStorage-backed feature services behind the persistence gateway.

v1.49 does not add random localStorage access to feature screens. Data package creation is centralised in:

```text
apps/web/src/features/budget/budgetDataExport.ts
```

The browser storage adapter exposes key enumeration through:

```text
apps/web/src/features/persistence/keyValueStoragePort.ts
```

This keeps export logic behind the existing storage boundary.

## Restore preview

Restore preview accepts a JSON file and reports:

- Whether the schema is supported.
- Budget name and id.
- Export date.
- Summary counts.
- Validation warnings/errors.

No restore commit exists in v1.49.

## Explicit non-goals

v1.49 does not implement:

- Destructive restore commit.
- App-wide backup.
- Import from third-party formats.
- YNAB4 migration UI.
- SQLite file export.
- Cloud backup.

## Follow-up

A later restore release should add:

1. Dry-run conflict detection against the active app state.
2. Explicit user confirmation.
3. Restore into a new budget by default.
4. Optional overwrite of the current budget only after strong confirmation.
5. Release-integrity tests proving restore cannot cross budget boundaries.
