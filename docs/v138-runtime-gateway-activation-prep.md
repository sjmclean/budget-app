# v1.38 Runtime Gateway Activation Prep

## Goal

Prepare the web runtime for a future SQLite-backed persistence gateway without activating SQLite as the browser default.

The migration now has validated SQLite adapters for:

- accounts
- payees
- account registers
- register transfers

v1.38 focuses on the remaining runtime seam: UI modules must not capture the default localStorage gateway at module load time, because that prevents a desktop/Tauri bootstrap from configuring a SQLite-capable gateway before React renders.

## Changes

- Added runtime gateway configuration helpers:
  - `configureAppPersistenceGateway(gateway)`
  - `resetAppPersistenceGateway()`
- Kept browser localStorage as the default when no runtime gateway is configured.
- Updated UI consumers to resolve the active gateway inside components/hooks instead of storing module-level persistence constants.
- Added a validation test covering default gateway selection, configured runtime gateway selection, explicit backend selection, and old module-level capture regressions.

## Runtime Status

Current default remains:

```text
browser localStorage
```

Prepared runtime path:

```text
Tauri/Desktop bootstrap
        ↓
compose SQLite gateway
        ↓
configureAppPersistenceGateway(sqliteGateway)
        ↓
React UI consumers
        ↓
active gateway
```

## Activation Decision

v1.38 does not flip production runtime persistence.

It makes activation possible by removing the old hard default capture pattern from UI modules.

Recommended next release:

```text
v1.39 Runtime SQLite Activation Spike
```

That release should compose the real desktop SQLite gateway and decide whether runtime activation can be enabled behind an explicit backend switch.
