# YNAB4 import

The application has one supported YNAB4 import path. It imports a complete
zipped `.ynab4` package from the budget launcher into a newly created budget.
CSV-based YNAB4 import and direct SQLite YNAB4 import are not supported.

## Operational path

1. `BudgetImportDialog.tsx` reads the selected ZIP/folder into package entries.
2. `analyzeYnab4Package.ts` validates `Budget.ymeta`, locates the active data
   folder, selects the newest device with complete knowledge, and prepares the
   migration preview.
3. `budgetRegistryStore.ts` invokes
   `createYnab4LauncherBudgetImportWithBackend()`.
4. `ynab4LauncherImport.ts` maps and atomically persists the new budget.
5. `ynab4LauncherImportAccuracyAudit.ts` compares the persisted result with
   the exact selected source snapshot. A failed audit rolls the import back.

No other YNAB4 writer is exported or reachable from the application.

## Imported data and decisions

- Live accounts are imported; hidden accounts become closed accounts.
- Explicit opening balances are preserved. Current-balance snapshots are not
  reused as opening balances because transaction history supplies balances.
- Live outflow category groups and categories are imported in source order.
- Tombstoned groups, categories, transactions, and split lines are excluded.
- Hidden categories are archived and retain a readable qualified name.
- Ordinary payees are imported. Transfer payees are represented by linked
  account transfers, not ordinary spending payees.
- Transactions preserve dates, amounts, memos, check numbers, cleared and
  reconciled state, splits, transfers, and supported coloured flags as tags.
- Tracking-account activity is excluded from envelope budget activity.
- Monthly assigned amounts are imported. Activity is derived from imported
  transactions. `Confined` overspending carries a negative balance forward.
- Scheduled transactions are imported when their recurrence can be represented
  exactly. Unknown or non-uniform recurrence rules fail rather than silently
  changing frequency.
- Valid `budgetMetaData.currencyISOSymbol` is used. Missing metadata falls back
  to AUD for compatibility and records a warning.

## Safety guarantees

- ZIP order is never used to choose between device snapshots.
- Transfer pairs must be reciprocal, target the expected accounts, have equal
  and opposite amounts, and share a date.
- The importer creates a new budget; it does not merge into an existing one.
- Storage writes are rolled back on persistence or accuracy-audit failure.
- The source snapshot selected during discovery is also used by the audit.

## Test coverage

Production-path tests cover package discovery, previews, multi-device snapshot
selection, currency, storage rollback, diagnostic auditing, accounts, category
identity/order/tombstones, payees, transaction amounts, splits, transfers,
tracking accounts, monthly activity/carryover, flags/tags, schedules, opening
balances, folder selection, and complete budget deletion.

Run the focused suite with:

```sh
pnpm test:ynab4-import
```

Run the complete verification gate with:

```sh
pnpm verify:ynab4-import
```

## Relationship to bank import

YNAB4 package import is separate from CSV/QIF/OFX/QFX bank-statement import.
Bank import owns matching, deduplication, payee rules, review, and commit/undo.
