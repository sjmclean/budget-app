# v1.30 SQLite Adapter Foundation

## Purpose

v1.30 introduces a SQLite-shaped persistence adapter foundation for the web persistence seam without changing the default browser runtime.

The goal is to prove that the existing persistence ports can be backed by SQLite-style repositories through explicit mapping/adapters before the application switches any UI workflow away from browser localStorage.

## Change

Added foundation adapters for:

- Accounts
- Payees

Added a SQLite persistence gateway composition point that can accept SQLite-backed account and payee dependencies while reusing the existing browser-localStorage implementations for domains that have not yet been migrated.

The browser default remains unchanged:

```text
getAppPersistenceGateway()
→ browserLocalStoragePersistenceGateway
```

## Added files

- `apps/web/src/features/persistence/sqliteAccountPersistenceAdapter.ts`
- `apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.ts`
- `apps/web/src/features/persistence/sqlitePersistenceGateway.ts`
- `tests/v130-sqlite-adapter-foundation.ts`

## Validation

Run:

```bash
pnpm test:v130
pnpm --filter @budget-app/web build
```

Expected result:

- SQLite adapter foundation checks pass.
- Web build passes.
- Browser build does not pull SQLite/native dependencies into the Vite bundle.

## Intentionally unchanged

- Browser runtime still uses localStorage by default.
- No UI workflow is switched to SQLite yet.
- Register, categories, scheduled transactions, and budget activity remain localStorage-backed in the browser gateway.
- Account deletion remains conservative in the SQLite account foundation adapter.
- No Tauri/desktop SQLite wiring is introduced in this release.

## Important implementation note

`AccountPersistencePort.getAccountById(...)` is currently synchronous. The v1.30 adapter therefore maintains an in-memory account cache after async list/create/update calls. A future release should revisit whether the port should become async before deeper SQLite migration work.

## Next step

v1.31 should validate real SQLite-backed account and payee workflows through the adapter layer:

- Create account
- Edit account
- List accounts
- Create/record payee
- Rename payee
- Delete/archive payee behaviour decision
- Confirm duplicate payee handling
- Confirm no browser bundle imports native SQLite packages
