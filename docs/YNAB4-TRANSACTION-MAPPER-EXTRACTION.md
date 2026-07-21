# YNAB4 transaction mapper extraction

The browser launcher previously owned transaction mapping and register balance
reconstruction alongside package orchestration and persistence. That logic now
lives in `apps/web/src/features/budget/ynab4/mapYnab4Transactions.ts`.

The extracted mapper is persistence-independent and owns:

- tombstone filtering and source-account resolution;
- amount, payee, category, flag, memo, and cleared-state mapping;
- split-line reconstruction;
- transfer metadata and deterministic imported transfer IDs;
- register ordering, running balances, and cleared/working balances.

`ynab4LauncherImport.ts` now supplies source rows, mapped identities, accounts,
currency, and imported flag-tag identities, then places the returned registers
into the import plan. No transaction behaviour was intentionally changed.
