# v1.21 Accounts Persistence Port

## Purpose

This release starts persistence unification for accounts without migrating the whole app at once.

The web UI previously imported the concrete browser `accountService` directly from account screens. That made the UI depend on the localStorage implementation and made later SQLite/Tauri wiring harder.

v1.21 introduces a UI-facing `AccountPersistencePort` and routes account UI calls through the central `AppPersistenceGateway`.

## What changed

- Added `apps/web/src/features/accounts/accountPersistencePort.ts`.
- Updated `AppPersistenceGateway.accounts` to depend on `AccountPersistencePort`.
- Updated the sidebar account list/actions to use `getAppPersistenceGateway().accounts`.
- Updated transfer account loading in the register page to use the gateway account port.

## What did not change

The active implementation is still browser localStorage through `browserLocalStoragePersistenceGateway`.

This is intentional. The browser build must not directly import:

- `better-sqlite3`
- filesystem modules
- database package code that depends on Node-only APIs

The next SQLite step should add a desktop-safe/Tauri account adapter behind this same port, not import SQLite repositories directly into React components.

## Why accounts first

Accounts are the smallest persistence surface and a good first migration target:

- account list
- create account
- edit account
- close/reopen account
- delete empty account
- account lookup for transfer selection

This establishes the migration pattern before moving higher-risk areas such as registers, splits, categories, budget months, and scheduled transactions.

## Next step

v1.22 should implement a SQLite/Tauri account adapter behind `AccountPersistencePort`, or add the Tauri command boundary needed for that adapter.
