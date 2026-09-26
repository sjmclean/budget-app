# Financial Engine

The authoritative budgeting projection lives in `packages/budget-engine`.

It operates on canonical facts and returns deterministic derived financial
state.

## Canonical facts

Examples include:

- accounts and participation;
- categories;
- category assignments;
- overspending policies;
- transactions and splits;
- explicit general-income budget month;
- explicit income/reporting classification for direct-category inflows;
- transfer relationships;
- credit-card payment relationships.

## Derived state

The engine derives:

- activity;
- previous Available;
- Available;
- overspending;
- monthly totals;
- income;
- Available to Budget;
- money not budgeted in the previous month;
- rollover;
- credit-card funding behaviour.

Derived values are not independent persisted financial authorities.

## Monthly income and Available to Budget

General income is assigned explicitly to exactly one budget month.

For a transaction dated in month M, the only valid general-income destinations
are M and M+1.

The month-level budget pool projects chronologically:

```text
Available to Budget(M) =
    Not Budgeted in M-1
  + Income for M
  + previous-month overspending adjustment
  - assignments made in M
```

Money left unbudgeted at month end carries forward into the next month. It is
not counted again as income.

Positive category Available balances also carry forward independently.

Arbitrary distant-future assignments and backwards reservation of earlier money
against later assignments are not part of the financial model.

See [Explicit Monthly Income Model](explicit-monthly-income.md).

## Income reporting

Budget destination and reporting classification are separate facts.

A general **Income for <month>** transaction is income automatically.

A positive inflow directly to a normal category may represent either genuine
income or a refund/category inflow. Canonical transaction/split data must record
that distinction explicitly. Reports must not infer genuine income from
`amount > 0` alone.

Transfers are not income.

## Projection

`projectBudget()` is the authoritative month-projection boundary.

It:

- uses integer minor units;
- validates input references and dates;
- validates split conservation;
- projects months chronologically;
- applies account participation rules;
- applies transaction and transfer rules;
- handles category rollover;
- applies credit-card policy.

Persistence and UI layers must not reproduce financial arithmetic
independently.

## Overspending policies

Two category policies are supported:

- `carry-category`;
- `reduce-next-month`.

Policy is explicit and may vary over time.

## Credit cards

Projection supports explicit credit-card policy including:

- `manual`;
- `payment-funding`.

Persistence and UI layers supply policy but must not reproduce the underlying
financial arithmetic independently.

## Reconciliation

Imported or external calculated values may be used as reconciliation evidence.

They do not remain an ongoing financial authority after canonical data has been
committed.

## Reports

Reports consume canonical or projected financial data.

A report may calculate presentation-specific aggregates, but it must not define
a competing version of budgeting policy or transaction classification.
