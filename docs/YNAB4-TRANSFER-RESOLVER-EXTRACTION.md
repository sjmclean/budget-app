# YNAB4 transfer validation extraction

## Scope

This update extracts the existing parent-transaction transfer integrity checks from the browser launcher importer into a persistence-independent YNAB4 package module.

## Added

- `packages/ynab4-importer/src/transfers/validateYnab4TransferIntegrity.ts`
- `tests/suites/ynab4/transfers.test.ts`

## Updated

- `apps/web/src/features/budget/ynab4LauncherImport.ts` now imports the shared validator.
- `packages/ynab4-importer/src/index.ts` exports the shared validator.

## Behaviour

No transfer rule was intentionally changed. The extracted validator retains the launcher's existing requirements:

- paired transaction must exist;
- pairing must be reciprocal;
- source and destination accounts must be complete and reciprocal;
- self-transfers are rejected;
- amounts must be equal and opposite to two decimal places;
- dates must match when both are present;
- tombstoned parent transactions are ignored.

Split-child transfer mapping remains outside this extraction and should be audited separately before expanding the validator's scope.
