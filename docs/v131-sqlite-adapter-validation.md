# v1.31 SQLite Adapter Validation

## Purpose

v1.31 validates that the SQLite persistence adapters introduced in v1.30 can round-trip through the real SQLite repository implementations.

This release does not switch the application to SQLite persistence. Browser localStorage remains the default gateway.

## Scope

Validated through real repositories and a temporary SQLite database:

- Account create
- Account update
- Account list/load
- Account cache lookup after list/update
- Credit card account mapping
- Tracking/off-budget account mapping
- Payee create
- Payee duplicate detection by normalized name
- Payee bulk record
- Transfer pseudo-payee exclusion
- Payee rename
- Payee merge-style rename to an existing normalized payee
- Payee delete

## Intentional Non-Scope

The following remain intentionally out of scope:

- UI persistence switching
- Tauri runtime wiring
- Register/transaction SQLite migration
- Scheduled transaction SQLite migration
- Account deletion through SQLite adapter
- Account close/reopen persistence

Account delete/close/reopen remain disabled in the SQLite account adapter because the current SQLite account repository/schema does not yet provide the required safety semantics or closed-account fields.

## Validation

Run:

```bash
pnpm test:v131
pnpm --filter @budget-app/web build
```

Recommended regression set before tagging:

```bash
pnpm test:v127
pnpm test:v130
pnpm test:v131
pnpm --filter @budget-app/web build
```

## Result

The persistence chain validated by this release is:

```text
UI persistence port contract
  ↓
SQLite account/payee adapters
  ↓
Real SQLite repositories
  ↓
Temporary SQLite database
```

The browser application still uses:

```text
UI
  ↓
AppPersistenceGateway
  ↓
BrowserLocalStoragePersistenceGateway
```
