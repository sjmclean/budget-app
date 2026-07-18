# v3.22.1 Transaction Import Facade Regression

The v3.22.0 reconciliation extraction accidentally removed public declarations
from `transactionImport.ts`. Reconciliation tests continued to pass because they
did not compile the complete web application.

This correction restores the established facade contract:

- `TransactionImportCandidate`
- `TransactionImportPerformanceEntry`
- `TransactionImportPerformanceReport`
- `createTransactionImportPerformanceReport`
- `formatImportDuration`

It also gives the import review card explicit local narrowing for the active
processing state and active proposal editor. This avoids relying on optional
chaining to narrow a separately-read nullable React state value.

The regression suite checks both the TypeScript import surface and the
structural narrowing markers. The production build remains the authoritative
full-application compilation check.
