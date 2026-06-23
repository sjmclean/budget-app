# v1.66 YNAB4 Monthly Budget Mapping Audit

## Purpose

v1.66 keeps the YNAB4 migration work non-destructive and focuses on the highest-risk remaining correctness area: historical monthly budget data.

A full YNAB4 migration is not complete if it imports accounts and transactions but loses or corrupts historical budget months.

This audit asks:

- how YNAB4 monthly budget rows should map to `budget_months`
- how YNAB4 monthly subcategory budget rows should map to `category_months`
- which values can be imported directly
- which values should be recalculated or validated
- which semantics are still blocked until proven against real data

## Current Destination Model

Current app storage has:

- `budget_months`
  - `month`
  - `income`
  - `assigned`
  - `activity`
  - `ready_to_budget`

- `category_months`
  - `previous_available`
  - `assigned`
  - `activity`
  - `available`

This means the app has a destination for historical budget state, but mapping correctness is not yet proven.

## Key Audit Findings

### 1. Monthly budget rows are not safe to import blindly

YNAB4 monthly budget rows need explicit mapping to `budget_months`.

The importer must prove how to calculate or map:

- income
- assigned total
- activity total
- ready to budget
- Income for Month / Income for Next Month semantics

### 2. Category month rows require semantic validation

YNAB4 monthly subcategory budgets need explicit mapping to `category_months`.

The importer must prove how to map:

- assigned / budgeted values
- activity
- available / balance
- previous available / carry-forward
- overspending behaviour

### 3. Available/balance values should be validation targets

The audit treats YNAB4 available/balance-like fields as values to validate against, not values to blindly trust.

The app should be able to recalculate:

```text
available = previous_available + assigned + activity
```

and compare the result to YNAB4's stored value where possible.

### 4. Overspending and Ready To Budget remain blockers

YNAB4 historical overspending behaviour must be reconciled with the app's explicit overspending decision model before monthly data writes begin.

This is especially important because the project decision is:

```text
overspending should require an explicit decision
```

but imported historical YNAB4 months may already contain overspending/carry-forward outcomes.

## Recommended Next Step

Before importing transactions, create mapping tests using real YNAB4 monthly budget data.

The next implementation should prove:

1. month identity mapping
2. category-month identity mapping
3. assigned/budgeted amount mapping
4. activity amount mapping
5. available/recalculation validation
6. overspending and Ready To Budget behaviour

## Test Command

```bash
pnpm test:v166
```

## Build Verification

```bash
pnpm --filter @budget-app/web build
```
