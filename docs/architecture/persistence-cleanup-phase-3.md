# Persistence cleanup phase 3

This phase removes the abandoned web SQLite-adapter experiment and the deprecated
`AppPersistenceGateway` compatibility vocabulary.

## Removed

- SQLite account, register, payee, and gateway adapters from the web persistence layer.
- The `sqlite-adapter` backend kind and runtime mode.
- `AppPersistenceGateway` and its deprecated configure/get/reset factory aliases.
- Deprecated host globals and functions using the old gateway name.
- Historical adapter activation tests and their package scripts.

## Retained

- `BudgetPersistenceProvider`, the current application persistence contract.
- The modern host injection point, `window.__BUDGET_APP_PERSISTENCE_PROVIDER__`.
- Browser local storage as a temporary rollback provider and migration source.
- The local database, journal, checkpoint, replication, conflict, and attachment stack.

The repository-level database and repository packages are not removed. They are
independent domain infrastructure and may still support tooling or future native hosts;
only the unused web adapter composition has been retired.
