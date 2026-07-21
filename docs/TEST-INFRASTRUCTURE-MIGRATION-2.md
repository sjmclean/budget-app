# Test Infrastructure Migration — Slice 2

## Added

- Unique temporary SQLite database paths for new scenarios.
- Explicit `cleanup()` / `dispose()` lifecycle for SQLite scenarios.
- Shared budget and transaction assertion helpers.
- Shared funded budget-month fixtures.

## Migrated behavioural tests

- `budget-month.ts`
- `assign-budget-money.ts`
- `spend-budget-money.ts`
- `rollover-month.ts`
- `overspending.ts`
- `split-transaction.ts`

The migrated files now make behavioural assertions and include validation, immutability, rollover, conservation, and split-balancing checks rather than logging values.

## Validation limitation

The uploaded source archive does not include installed dependencies. The changes were statically reviewed, but the TypeScript test commands must be run after `pnpm install` in the development environment.
