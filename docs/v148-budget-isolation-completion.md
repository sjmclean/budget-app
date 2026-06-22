# v1.48 Budget Isolation Completion

v1.48 completes the first practical budget data isolation layer after v1.47 introduced active budget context.

## Implemented

- Added a reusable budget data scope helper.
- Added a browser localStorage budget-scoped storage wrapper.
- Scoped browser-backed accounts, account registers, payees, and scheduled transactions by active budget.
- Updated budget activity persistence to read and rewrite register/scheduled category references through the scoped storage boundary.
- Persisted selected budget id from the UI store so browser persistence services can resolve the active budget consistently.
- Preserved legacy starter-budget global localStorage data as a migration bridge for the original `household` budget.
- Added release validation for budget switching isolation.
- Added formal data-boundary documentation.

## Important Boundary

The browser localStorage gateway now stores budget-owned domains under:

```text
budget-app.budgets.<budgetId>.<original-key>
```

The following domains are scoped:

```text
Accounts
Account registers / transactions / attachment metadata
Payees
Scheduled transactions
Budget activity reads and category-reference rewrites
```

Budget month views were already keyed by budget id and month.

## Not Included

v1.48 does not implement Reset Budget or Delete Budget. Those should come after this isolation layer is validated in the running app.

v1.48 also does not fully split Settings into global settings and budget settings. That is documented as a follow-up in `docs/budget-data-boundaries.md`.

## Validation

Run:

```bash
pnpm test:v148
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```
