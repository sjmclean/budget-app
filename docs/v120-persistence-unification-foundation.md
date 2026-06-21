# v1.20 Persistence Unification Foundation

## Purpose

The web app currently has two persistence worlds:

1. React feature services using browser `localStorage`.
2. Package-level SQLite repositories and application services.

v1.20 starts unification by introducing a browser-safe persistence gateway. This is a seam only: behaviour remains unchanged and still uses the existing localStorage-backed services.

## Why this comes before more features

Adding more UI features directly to the localStorage services would create duplicate work because backend/application services already exist for many areas. The gateway gives the UI one place to depend on while SQLite-backed adapters are introduced incrementally.

## Files added

- `apps/web/src/features/persistence/appPersistenceGateway.ts`
- `apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.ts`
- `apps/web/src/features/persistence/appPersistenceGatewayFactory.ts`
- `apps/web/src/features/persistence/index.ts`

## Rule going forward

React components and hooks should gradually move toward:

```ts
getAppPersistenceGateway()
```

instead of importing concrete localStorage services directly.

The web app must not directly import:

- `better-sqlite3`
- Node filesystem modules
- database connection/bootstrap code
- Tauri invoke APIs from arbitrary components

Those belong behind a gateway/adapter.

## Migration order

Recommended order remains:

1. Accounts
2. Payees
3. Categories / budget view
4. Register transactions / splits / transfers
5. Scheduled transactions

## Status after this release

- UI behaviour: unchanged
- Active persistence: browser localStorage
- SQLite-backed UI: not yet implemented
- Main benefit: there is now a central place to swap persistence implementations safely
