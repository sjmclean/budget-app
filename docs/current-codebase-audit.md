# Current Codebase Architecture Audit

Status: current local-first architecture.

## Executive Summary

The web application uses local-first SQLite as the authoritative store for
budget data through the configured budget persistence provider.

Application startup configures and initializes persistence before loading the
main React application. Synchronisation uses the local-first relay
architecture.

Earlier localStorage-based budget persistence has been retired from the
authoritative runtime. Direct browser localStorage usage that remains is for
non-authoritative UI state, preferences, sorting/layout choices, suppression
state, and diagnostic conveniences.

## Authoritative Persistence

The current browser persistence path is implemented through:

- `apps/web/src/features/persistence/configuredPersistenceProvider.ts`
- `apps/web/src/features/persistence/localDatabasePersistenceProvider.ts`
- `apps/web/src/features/persistence/localFirst/`
- `apps/web/src/main.tsx`

The configured runtime uses:

- local-first SQLite
- local-first account/register query clients
- local-first relay synchronisation
- provider-backed key/value persistence where still required
- persistence initialization before the main React application loads

## Remaining Browser localStorage

Direct `window.localStorage` use remains for non-authoritative browser state,
including:

- selected-budget diagnostic context
- register sort preferences
- navigation rail state
- budget display/layout preferences
- payee-management suppression preferences
- navigation pinning
- theme preferences

These values are not authoritative budget data.

## Current UI Integration

The application includes UI integration for major areas including:

- budgeting and category management
- accounts and register transactions
- payee management
- scheduled transactions
- transaction import
- reports
- restore points
- undo/redo workflows
- reconciliation-related transaction behaviour
- application-specific confirmations, prompts, alerts, and toasts

Detailed feature limitations should be documented in focused architecture,
feature, or test documents rather than in historical persistence migration
notes.

## Application Dialogs

Active UI workflows use the application dialog system rather than native
browser `alert()`, `confirm()`, or `prompt()` calls.

The shared implementation is:

- `apps/web/src/features/ui/appDialogService.ts`
- `apps/web/src/features/ui/AppDialogsProvider.tsx`

## Historical Migration Documents

Versioned migration documents under `docs/`, such as
`docs/v119b-persistence-migration-matrix.md`, describe earlier architecture
at specific development milestones.

They are retained as historical records and should not be interpreted as
descriptions of the current runtime.

## Current Architecture Sources of Truth

The primary current architecture documents are:

- `docs/architecture/README.md`
- `docs/architecture/local-first-migration.md`
- `docs/architecture/persistence-audit-phase-1.md`
- `docs/architecture/persistence-audit.json`

Additional architecture documents under `docs/architecture/` may define
subsystem contracts and are validated by their corresponding scripts/tests.

Regenerate the persistence audit with:

    pnpm audit:persistence

Validate architecture changes with:

    pnpm --filter ./apps/web build
    pnpm test:required
    pnpm audit:persistence
    git diff --check
