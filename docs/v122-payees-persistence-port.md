# v1.22 Payees Persistence Port

## Purpose

This release moves direct Payee UI access behind the app persistence gateway.

The goal is not to change behaviour yet. The web app still uses the existing
browser localStorage-backed payee implementation, but UI code now depends on a
browser-safe port that can later be implemented by a SQLite/Tauri adapter.

## Why this matters

Before this release, `AccountRegisterPage` imported the concrete payee service
directly:

```text
AccountRegisterPage
  -> BrowserPersistentPayeeService
  -> localStorage
```

After this release, payee UI operations flow through the persistence gateway:

```text
AccountRegisterPage
  -> AppPersistenceGateway.payees
  -> current localStorage implementation
```

This matches the v1.20 unification direction and avoids adding more UI code that
is coupled to localStorage.

## Scope

Changed in this release:

- Adds `PayeePersistencePort`.
- Updates `AppPersistenceGateway.payees` to use the new port type.
- Updates the account register payee manager to use `getAppPersistenceGateway().payees`.
- Preserves existing payee list, autocomplete, and rename behaviour.

Not changed in this release:

- No SQLite adapter yet.
- No payee merge UI.
- No payee archive UI.
- No change to payee localStorage data shape.
- No change to register or scheduled transaction persistence.

## Remaining coupling

Some non-UI services still call the concrete payee service internally when they
record payees during transaction and scheduled transaction creation. That should
be handled in a later register/scheduled transaction persistence-port release to
avoid circular dependencies and oversized changes.

## Next recommended steps

1. Categories persistence port.
2. Scheduled transactions persistence port.
3. Register persistence port.
4. SQLite/Tauri adapter implementation.
