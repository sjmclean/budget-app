# Milestone 2: Local database authority

## Status

Implemented in the browser runtime with a reversible first-launch migration.

## What changed

The web application now selects `local-database` by default. Feature code still
uses the existing `BudgetPersistenceProvider` ports, but the active key/value
store is a dedicated IndexedDB database rather than a mixture of localStorage
and IndexedDB pointers.

```text
React and feature services
        |
BudgetPersistenceProvider
        |
Local database provider (authoritative)
        |
IndexedDB durable records + synchronous hydrated mirror
```

A desktop host may continue to inject the existing SQLite provider through the
host persistence gateway. The browser implementation is engine-neutral because
SQLite is not built into browsers; introducing a WASM SQLite engine can now be
done inside this boundary without changing feature code.

## Migration and restore point

On first launch, when the local database is empty:

1. The legacy browser provider is hydrated.
2. Canonical budget records are exported.
3. The records are copied in one local-database transaction.
4. Legacy data is retained untouched.

Rollback requires no data conversion. Start the web app with:

```bash
VITE_BUDGET_PERSISTENCE_MODE=browser-local-storage pnpm dev
```

The former shared-server authority mode remains available with:

```bash
VITE_BUDGET_PERSISTENCE_MODE=shared-server pnpm dev
```

## Safety properties

- Startup waits for database hydration before importing the React application.
- Reads are synchronous only after successful initialization.
- Writes are serialized and flushed on lifecycle boundaries.
- First-launch migration runs only when the target database is empty.
- Source data is copied, never deleted.
- Unsupported future schema versions fail closed on the recovery screen.

## Deliberate limitation

This milestone establishes local authority and the provider boundary in the web
runtime. It does not claim that IndexedDB is SQLite. Browser SQLite requires a
separate WASM/OPFS engine decision. Desktop/native runtimes can use the existing
SQLite repository adapters immediately through host injection.
