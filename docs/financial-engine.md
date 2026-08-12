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
- Ready to Assign;
- rollover;
- credit-card funding behaviour.

Derived values are not independent persisted financial authorities.

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
a competing version of budgeting policy.
