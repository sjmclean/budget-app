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

## Consolidated test entry points (current migration)

The repository is migrating from milestone-named standalone scripts to feature-based suites.

- `pnpm test:legacy:list` discovers and lists every legacy `.ts` and `.mjs` test outside `tests/suites` and `tests/support`.
- `pnpm test:legacy` runs that discovered legacy set sequentially and writes `test-results/legacy-tests.json`.
- `pnpm test:node` runs the new feature-based suites using Node's test runner through `tsx`.
- `pnpm test:all` runs both the complete discovered legacy suite and the new suites.
- `pnpm test:legacy:registered` preserves the previous manually chained aggregate command temporarily for comparison only. It is incomplete and must not be treated as the full suite.

Empty historical placeholders are explicitly documented in `tests/legacy-test-manifest.json`. Any new empty test file that is not quarantined causes legacy discovery to fail.

The first migrated domain is scheduled transactions. New tests live in `tests/suites/scheduled-transactions`, with shared setup in `tests/support/scheduledTransactionHarness.ts`. Historical tests remain in place during the migration so behaviour is not silently discarded.
