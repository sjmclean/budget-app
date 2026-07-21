# YNAB4 Import Untangling Report

## Completed in this change

- Removed the unused direct `.ynab4` package-to-database executor.
- Removed its public barrel export.
- Removed its two implementation-specific legacy tests.
- Removed obsolete package scripts for those tests.
- Removed the deleted tests from the legacy classification and test audit.
- Documented the single supported runtime import path.

## Files removed

- `packages/ynab4-importer/src/executeYnab4PackageImport.ts`
- `tests/v169-ynab4-import-execution-engine.ts`
- `tests/v170-ynab4-import-progress-reporting.ts`

## Why these tests were removed

Both tests exercised only the deleted executor. They did not invoke the
production launcher path. Retaining them would preserve a second behavioural
contract for an unsupported implementation.

The production launcher already has coverage for package discovery, atomic
creation, backend storage, diagnostics, transactions, transfers, scheduled
transactions, category activity, rollover, category identity, tracking-account
isolation and amount fidelity.

## Deliberately not removed

The package analyser remains a production dependency of the budget import UI.
The legacy CSV/database importer remains pending a product decision about YNAB
CSV import support.
