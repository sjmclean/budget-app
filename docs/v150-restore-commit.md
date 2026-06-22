# v1.50 Restore Commit

## Purpose

v1.50 completes the backup/restore stream started in v1.49.

v1.49 added JSON export, backup, and restore preview. v1.50 adds a destructive restore commit that is deliberately constrained to the currently selected budget.

## Behaviour

The Settings → Data screen now supports:

- Export current budget to JSON.
- Backup current budget to JSON.
- Preview a backup/export package.
- Restore the previewed package into the current budget after explicit confirmation.

## Restore Boundary

Restore is current-budget only.

Restore does not overwrite:

- Other budgets.
- The budget registry.
- Selected budget id.
- Global settings/preferences.
- Cloud configuration placeholders.

Current v1.50.1 backup packages keep global settings and registry data outside restorable records as diagnostic snapshots. Older v1.49/v1.50 packages may contain global records; restore skips them.

## Safety Rules

Before writing package records, restore removes the current budget's known budget-scoped records:

- Accounts.
- Account registers and transactions.
- Payees.
- Scheduled transactions.
- Budget month views.

Then it writes only recognised budget-scoped records from the package.

Unsupported keys are skipped with warnings. Invalid JSON records fail the restore before any existing current-budget data is removed.

## Budget Identity

A package created from one budget may be restored into the currently selected budget. In that case, restore maps package keys from the source budget id to the active budget id.

This supports recovery into the current budget without silently creating, deleting, or switching budgets.

## Validation

Run:

```bash
pnpm test:v150
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```

`tests/v150-restore-commit.ts` validates:

- Restore writes backup data into the selected budget.
- Stale selected-budget data is removed first.
- Other budgets are not overwritten.
- Global settings survive restore.
- Current diagnostic snapshots are not written as restorable records.
- Legacy global snapshot records are skipped.
- Unsupported keys cannot be written through restore.
- Invalid packages do not restore.
