# v1.24 Scheduled Transactions Persistence Port

## Purpose

This release continues persistence unification by moving scheduled transaction UI
operations behind the shared `AppPersistenceGateway`.

The web UI should not import the concrete localStorage-backed scheduled
transaction service directly. It should depend on a scheduled transaction
persistence port exposed through the gateway, so a future SQLite/Tauri adapter
can implement the same contract.

## Scope

Added:

- `ScheduledTransactionPersistencePort`
- `AppPersistenceGateway.scheduledTransactions` typed to the new port
- scheduled transaction panel wiring through the gateway
- payee rename reference updates wired through the gateway

Preserved:

- existing localStorage behaviour
- existing scheduled transaction panel behaviour
- existing due count behaviour
- existing scheduled transaction enter/advance behaviour
- existing scheduled payee rename reference behaviour

## Not included

This release does not:

- move scheduled transactions to SQLite yet
- add scheduled split support
- redesign the scheduled transactions panel
- replace `window.alert` / `window.confirm`
- change due-date or frequency semantics

## Why this comes before register persistence

Scheduled transactions are a medium-risk domain and are smaller than the account
register. Moving them behind the gateway first reduces the number of direct
localStorage service dependencies before the higher-risk register migration.

The register still remains the largest persistence migration because it includes:

- transactions
- splits
- transfers
- attachments
- running balances
- scheduled transaction entry flow

## Next recommended step

Before implementing the register persistence port, perform a short architecture
audit to list the remaining direct concrete service imports and decide whether
register migration should be split into smaller releases.
