# Testing

Tests are TypeScript scripts run with `tsx` through pnpm scripts in `package.json`.

## Running tests

```bash
pnpm install
pnpm test:all
```

Milestone-specific suites are available, for example:

```bash
pnpm test:v1214
pnpm test:v1213
pnpm test:v1210
```

## Test organisation

Tests live in `tests/` and are named by feature or milestone.

Examples:

```text
tests/v1214-bank-import-commit-undo.ts
tests/v1214-payee-rule-persistence.ts
tests/v1210-real-undo-redo.ts
tests/v129-database-integrity.ts
```

## Contract tests

Contract tests were added because the project hit a real factory/repository mismatch in v1.2.10. These tests should be expanded whenever factories, repositories, or schema fields change.

Contract tests should verify:

- Factories produce objects repositories can persist.
- Repository create/update methods accept current domain shapes.
- Required fields are not silently `undefined`.
- Date and enum conversions are stable.

## better-sqlite3 transaction rule

Do not use `async` callbacks inside better-sqlite3 transactions. Transaction callbacks must be synchronous. Add rollback tests for any new transaction-heavy workflow.

## Adding new tests

For any new backend feature:

1. Add a focused test file under `tests/`.
2. Add a package script.
3. Add it to the relevant milestone script.
4. Consider whether it belongs in `test:all`.
5. Prefer assertions that fail loudly over console-only smoke output.

## Test data rule

Use realistic domain values where possible: real account types, real transaction states, real import-like rows. Avoid tests that only prove a function can be called.
