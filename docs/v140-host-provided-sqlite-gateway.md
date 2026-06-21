# v1.40 Host-Provided SQLite Gateway

## Goal

Activate the runtime persistence seam without importing SQLite repository or database construction code into the browser bundle.

## Decision

The web app now supports a host-provided persistence gateway exposed before React renders:

```ts
window.__BUDGET_APP_PERSISTENCE_GATEWAY__
```

If the host provides a gateway, the bootstrap layer configures it as the active application persistence gateway. If no gateway is provided, the browser localStorage gateway remains the fallback.

## Runtime Shape

```text
Desktop/Tauri host
  ↓
composes AppPersistenceGateway
  ↓
sets window.__BUDGET_APP_PERSISTENCE_GATEWAY__
  ↓
main.tsx calls bootstrapHostPersistenceGateway()
  ↓
React renders
  ↓
UI consumers call getAppPersistenceGateway()
```

## Guardrail

The browser bootstrap must not import concrete SQLite repositories, database factories, or native database drivers. The host owns SQLite construction.

## Validation

`tests/v140-host-provided-persistence-gateway.ts` validates:

- Browser fallback remains localStorage when no host gateway exists.
- A host-provided gateway becomes the active no-argument runtime gateway.
- `main.tsx` bootstraps persistence before React renders.
- Browser bootstrap files do not import concrete SQLite repository/database code.
