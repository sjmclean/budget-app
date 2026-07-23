# Budget Engine Audit and Validation

Status: active validation baseline

## Scope

This audit covers the runtime monthly budget engine used by the Budget workspace:

- Ready to Assign composition
- monthly income
- category assignment and activity
- positive balance rollover
- non-confined overspending
- confined overspending
- generated future months
- legacy generated future-month repair
- multi-month rollover chains

## Confirmed defect

The Ready to Assign card previously inferred monthly income as the balancing value:

```text
income = readyToAssign - carriedForward - previousOverspending + assigned
```

When an older generated future month incorrectly retained Ready to Assign at zero, this made the UI invent income equal and opposite to previous overspending. The screenshot showing `-$56,461.64` previous overspending and `+$56,461.64` August income was this balancing artefact, not real income.

## Corrected model

Budget months now preserve an explicit `incomeForMonth` value calculated from register activity assigned to Ready to Assign.

```text
Ready to Assign
= carried-forward Ready to Assign
+ previous overspending
+ income for this month
- assigned this month
```

All values are signed. Previous overspending is negative.

## Validated rules

1. Positive available balances carry into the same category.
2. Non-confined negative balances reset to zero in the category and reduce next month's Ready to Assign.
3. Confined negative balances carry into the same category and do not reduce Ready to Assign a second time.
4. A future month with no transactions has zero monthly income.
5. Actual Ready to Assign income is derived from that month's register transactions.
6. Existing future-month assignments are preserved while rollover values refresh.
7. Legacy future months generated before rollover metadata existed are detected and repaired.
8. Rollover refresh proceeds chronologically through multiple months.

## Automated validation

`tests/v3237-budget-engine-validation.ts` covers:

- non-confined overspending
- confined overspending
- explicit future-month income
- legacy generated-month repair
- multi-month rollover propagation

## Pinned follow-up validation

- Credit-card overspending semantics and debt/payment-category interaction.
- Imported YNAB4 month-by-month parity using a real export fixture.
- Mixed income, assignments, spending, and both overspending modes in one scenario.
- Editing a prior month after several future months have assignments.
- Category creation, archive, merge, and deletion across an existing rollover chain.
- Money rounding and tolerance across long rollover chains.
- Ready to Assign explanation UI should consume engine fields only and never reconstruct a balancing value once legacy data is migrated.
