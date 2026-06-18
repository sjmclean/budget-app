# Development Guide

## Coding principles

- TypeScript throughout.
- Keep business rules in `budget-engine` or application services.
- Keep persistence in repositories.
- Keep filesystem/package work in `budget-file`.
- Keep shared domain types in `types`.
- Do not let UI code bypass application services.

## Application services

Application services orchestrate workflows. Good examples include:

- Payee management and payee rules.
- Import commit/rollback.
- Undo/redo.
- Backup/restore.
- Reconciliation.
- Bulk transaction actions.

They may call repositories, budget-engine services, and package/security helpers.

## Repositories

Repositories encapsulate SQLite access. They should not encode high-level budgeting behaviour. Use explicit field mappings in create/update methods where schema drift would be dangerous.

## Error handling

Prefer typed errors and `Result<T>` for recoverable domain failures. Avoid raw `throw new Error()` in user-facing workflows unless the failure is truly exceptional or there is a test proving it is handled.

## Comments standard

Use comments to explain business rules, compatibility decisions, safety constraints, and non-obvious implementation choices.

Good comment:

```ts
/**
 * YNAB4-compatible rollover: positive Available carries forward, but cash
 * overspending reduces next month's Ready To Assign if the user leaves it
 * uncovered. Do not change this without updating import/rollover tests.
 */
```

Poor comment:

```ts
// Loop over categories
```

## Adding a new mutating workflow

When adding a workflow that changes data, consider:

- Validation.
- Authorization/permission checks if multi-user applies.
- Audit/event record.
- Undo/redo payload.
- Import/sync implications.
- Tests.
- Whether the operation should be wrapped in a SQLite transaction.

## Versioning

Milestone releases currently use package versions like `1.2.14`. Each release should include:

- New or changed code.
- Tests.
- README/docs updates when behaviour changes.
