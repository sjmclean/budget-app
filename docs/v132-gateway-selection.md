# v1.32 Gateway Selection

## Purpose

Introduce gateway selection without changing application behaviour.

Current default:

browser-local-storage

Supported selections:

- browser-local-storage
- sqlite-adapter

The SQLite gateway is not yet activated for production use. This release only validates that the application can select between persistence gateways through a single factory.

## Architecture

UI
↓
Gateway Factory
↓
Browser Gateway
or
SQLite Gateway

## Validation

- Default selection returns browser-local-storage.
- Explicit browser selection returns browser-local-storage.
- Explicit SQLite selection returns sqlite-adapter.
- Requesting SQLite without a gateway instance throws.

## Future

v1.33 is expected to activate Accounts and Payees through the SQLite gateway.