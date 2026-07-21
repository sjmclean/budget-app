# YNAB4 Import Architecture

## Supported runtime path

The application has one supported YNAB4 package import execution path:

1. `packages/ynab4-importer/src/analyzeYnab4Package.ts`
   - discovers the package layout;
   - selects the active complete `Budget.yfull` snapshot;
   - builds the migration preview used by the UI.
2. `apps/web/src/features/budget/ynab4LauncherImport.ts`
   - validates the selected source data;
   - creates the new budget;
   - maps and writes accounts, categories, payees, transactions, transfers,
     schedules and monthly budget views.
3. `apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts`
   - compares the imported result with the selected YNAB4 source and records
     diagnostics.

The budget selector UI enters this flow through
`apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx`.

## Removed competing executor

The former direct package-to-database executor,
`packages/ynab4-importer/src/executeYnab4PackageImport.ts`, was removed because
it had no production caller and implemented a separate set of rules for:

- amount conversion;
- category activity and available values;
- split persistence;
- transfer handling;
- scheduled transactions;
- snapshot selection;
- import progress and import-map persistence.

Keeping that executor made it possible for the same source package to produce
materially different results depending on the entry point. Its two
implementation-specific legacy tests were removed with it.

## Legacy CSV importer

The following older CSV/database import stack remains temporarily:

- `parseCsv.ts`
- `parseYnabAmount.ts`
- `detectYnab4Columns.ts`
- `mapYnab4Rows.ts`
- `importYnab4.ts`
- `Ynab4DatabaseImportService.ts`

No production browser caller was found during this cleanup. It is retained for
a separate decision because it represents a different source format (YNAB CSV
exports) and still has historical tests. It must not be used as an alternative
`.ynab4` package execution path.

## Public API direction

New production code should import the package analyser directly. Do not add a
new package-to-database YNAB4 executor. Any future CLI or backend integration
must reuse the same canonical launcher mapping or a shared import-plan layer
extracted from it.

## Follow-up work

1. Decide whether YNAB CSV import is a supported feature.
2. If unsupported, remove the legacy CSV/database stack and migrate or retire
   its tests.
3. Move test-only audit/proof helpers from runtime source into `tests/support`.
4. Extract a canonical typed amount decoder and import plan from the launcher
   before adding another persistence adapter.
