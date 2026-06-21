# v1.34 Runtime Activation Audit

## Purpose

Determine whether the web runtime can safely activate the SQLite persistence gateway after the v1.30-v1.33 persistence foundation work.

This release is audit-only. It does not activate SQLite at runtime.

## Scope

Audited persistence gateway selection and the runtime-facing ports used by the React application:

- Accounts
- Payees
- Account registers
- Budget view
- Categories
- Scheduled transactions

## Current Runtime Path

The default browser runtime remains:

```text
UI
 ↓
AppPersistenceGateway
 ↓
Browser localStorage services
```

This is intentional and must remain true until all runtime-critical domains can use one coherent persistence backend.

## Validated SQLite Path

The SQLite adapter path is validated for the domains already ported:

```text
AppPersistenceGateway
 ↓
SQLite account/payee adapters
 ↓
SQLite repositories
```

The v1.33 wiring test confirms that SQLite-backed accounts and payees can be composed into a gateway using real repositories.

## Audit Findings

### Finding 1 — Gateway abstraction is in place

The UI-facing code depends on `getAppPersistenceGateway()` and the `AppPersistenceGateway` contract rather than directly importing SQLite, Drizzle, better-sqlite3, or repository classes.

Status: PASS.

### Finding 2 — SQLite gateway composition is deliberately hybrid

`createSqlitePersistenceGateway()` accepts SQLite-capable dependencies, but it still requires injected implementations for register, budget view, category, and scheduled transaction domains.

The current validated SQLite composition is therefore:

```text
Accounts               SQLite adapter
Payees                 SQLite adapter
Account registers      Browser localStorage gateway
Budget view            Browser localStorage gateway
Categories             Browser localStorage gateway
Scheduled transactions Browser localStorage gateway
```

Status: EXPECTED, but runtime activation blocker.

### Finding 3 — AccountRepository is not the immediate activation blocker

The domain `Account` model and SQLite `accounts` table currently do not contain `closedAt` / `closed_at`.

Account closure is currently a web/sidebar localStorage concern. Adding account closure to the domain repository is a separate design decision and should not be introduced merely to force SQLite activation.

Status: DO NOT EXPAND SCHEMA IN v1.34.

### Finding 4 — Register persistence is the critical next backend milestone

The account register port includes transaction creation, update, delete, clearing, attachments, transfer handling, and payee reference rename propagation.

Because accounts and payees are tightly referenced by register transactions, activating SQLite accounts/payees while registers remain localStorage-backed would create a split runtime persistence model.

Status: BLOCKER.

## Decision

Direct runtime activation of SQLite after v1.33 is a NO-GO.

The reason is not failed repository wiring. The reason is incomplete runtime persistence coverage.

SQLite account and payee adapters are validated, but runtime activation must wait until account register persistence is also SQLite-backed or until a deliberately designed hybrid migration bridge exists.

## Recommended Next Release

### v1.35 — Register SQLite Adapter Foundation

Implement a SQLite-backed `AccountRegisterPersistencePort` adapter.

Initial scope should focus on:

- Loading register view from SQLite transactions
- Adding standard transactions
- Updating standard transactions
- Deleting transactions via repository soft delete
- Toggling cleared state
- Preserving running balance calculation semantics

Out of scope for the first adapter foundation unless already straightforward:

- Attachments
- Scheduled transaction splits
- Full transfer parity
- Reconciliation UI parity

## Release Integrity

v1.34 adds an audit guard to the release integrity suite so future persistence work cannot accidentally claim runtime activation while the SQLite gateway still depends on localStorage-backed register, budget, category, or scheduled transaction implementations.
