# v1.43 Budget Activity Drilldown

## Summary

v1.43 adds an in-context budget activity drilldown for category rows on the Budget screen.

Clicking a non-zero category Activity amount opens a large modal that shows the register transactions and split lines that make up that category's activity for the active month.

## Behaviour

The drilldown includes:

- normal register transactions assigned to the selected category
- split transaction lines assigned to the selected category
- inflow/refund rows for the selected category

The drilldown excludes:

- transactions outside the selected budget month
- transactions assigned to other categories
- Ready to Assign / income rows
- transfer placeholder category rows
- unentered scheduled transactions

## UI

The Budget screen now renders category Activity values as clickable controls when the amount is non-zero.

The modal displays:

- category activity title
- month label
- row count
- date
- payee
- memo
- outflow
- inflow
- account
- total outflow
- total inflow
- net activity

Clicking a transaction row closes the modal and opens that transaction's account register. Direct transaction editor focus is intentionally left for a later register deep-link enhancement.

## Data Model

The budget view service exposes:

```ts
getCategoryActivityDrilldown({ budgetId, month, categoryId })
```

The returned rows are derived from the existing budget activity persistence stream, which keeps the drilldown aligned with the displayed Activity value.

## Validation

Added:

```bash
pnpm test:v143
```

Release integrity now includes v1.43:

```bash
pnpm test:release-integrity
```
