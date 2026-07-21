# Test Infrastructure Migration — Sprint 1

## Scope completed

This iteration establishes the first reusable test-support layer without moving or deleting the historical test collection.

### Shared domain builders

Added `tests/support/builders/domainBuilders.ts` with stable defaults for:

- budgets
- accounts
- category groups
- categories
- payees
- transactions

### SQLite budget scenario

Added `tests/support/persistence/sqliteBudgetScenario.ts` to centralise:

- test database reset and creation
- repository construction
- budget creation
- account creation
- category tree creation
- payee creation
- transaction creation
- linked transfer creation

### Baseline tests migrated

The following tests now use the shared scenario and assert persisted behaviour:

- `tests/save-budget.ts`
- `tests/save-accounts.ts`
- `tests/save-category-tree.ts`
- `tests/save-payee.ts`
- `tests/save-transaction.ts`
- `tests/save-transfer.ts`

### Documentation

`TESTING.md` now documents the shared builder/scenario approach and the rule that tests should assert observable behaviour instead of only logging repository output.

## Deliberately not changed

- Historical version-numbered tests remain in place.
- Test classifications remain unchanged.
- No product behaviour was changed.
- No test was deleted.
- The browser-backed and host-backed persistence harnesses have not yet been consolidated.

## Validation status

The archive supplied for this iteration did not include `node_modules`, so the TypeScript tests could not be executed in the isolated build workspace. The files were inspected for import paths and consistency against the current repository structure.

## Recommended next slice

1. Migrate `budget-month`, `assign-budget-money`, `spend-budget-money`, and `split-transaction` to shared fixtures.
2. Add reusable assertions for transaction persistence, balanced transfers, and budget availability.
3. Introduce a persistence contract harness that can run the same expectations against SQLite and other active persistence implementations.
