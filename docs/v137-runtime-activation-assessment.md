# v1.37 Runtime Activation Assessment

## Purpose

Assess whether the runtime gateway can now compose SQLite-backed accounts, payees, and account registers together after the v1.35 register adapter foundation and v1.36 transfer validation.

This release still does not make SQLite the default browser runtime. It validates the next activation shape so the eventual runtime switch is small and deliberate.

## Scope

Validated a mixed runtime gateway composition:

```text
Accounts               SQLite adapter
Payees                 SQLite adapter
Account registers      SQLite adapter
Budget view            Browser localStorage gateway
Categories             Browser localStorage gateway
Scheduled transactions Browser localStorage gateway
```

## Why This Is Different From v1.34

v1.34 documented account registers as the major activation blocker because the SQLite gateway could only safely validate accounts and payees.

Since then:

- v1.35 added the SQLite account register adapter foundation.
- v1.36 validated transfer mutation through the SQLite register path.

v1.37 proves those pieces can be composed through the actual `AppPersistenceGateway` selection path instead of only testing each adapter in isolation.

## Validation

Added:

```bash
pnpm test:v137
```

and extended:

```bash
pnpm test:release-integrity
```

The v1.37 test uses a real temporary SQLite database and real repositories. It creates a SQLite-capable gateway, selects it through `getAppPersistenceGateway("sqlite-adapter", gateway)`, and validates:

- account creation through the selected gateway
- payee creation through the selected gateway
- standard register transaction creation through the selected gateway
- transfer creation through the selected gateway
- read-model balances from SQLite-backed register persistence
- fallback domains remaining browser/localStorage-backed

## Decision

SQLite-backed runtime composition for accounts, payees, and account registers is now validated.

The remaining browser-backed domains are deliberate and explicit:

- Budget view
- Categories
- Scheduled transactions

## Recommended Next Release

### v1.38 — Runtime Activation Prep

Prepare a single runtime composition function for the desktop/Tauri SQLite runtime so callers do not have to manually assemble repositories and adapters.

The default browser runtime should remain unchanged until the desktop runtime has an explicit SQLite database lifecycle.
