# v1.33 SQLite Gateway Repository Wiring

## Purpose

Validate the missing link between the selectable SQLite persistence gateway and
the real SQLite repository layer.

Earlier releases established the pieces separately:

- v1.30 added SQLite-shaped account and payee adapters.
- v1.31 validated adapter round-trips against the repository layer.
- v1.32 added gateway selection while keeping browser localStorage as default.

v1.33 proves those pieces can be composed together:

```text
Gateway Factory
  ↓
SQLite Gateway
  ↓
Account / Payee Persistence Adapters
  ↓
Real SQLite Repositories
  ↓
SQLite database
```

## Scope

Included:

- Compose `createSqlitePersistenceGateway` with real SQLite account and payee adapters.
- Back those adapters with `SqliteAccountRepository` and `SqlitePayeeRepository`.
- Select the SQLite gateway through `getAppPersistenceGateway("sqlite-adapter", gateway)`.
- Validate account and payee operations through the selected gateway.

Excluded:

- No browser default change.
- No runtime SQLite activation.
- No Tauri wiring.
- No register, transaction, transfer, or split migration.
- No UI changes.
