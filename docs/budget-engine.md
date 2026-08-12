# Budget Engine

The authoritative budget engine lives in `packages/budget-engine`.

It owns deterministic financial projection and reusable budgeting rules. The
engine must remain independent of React, browser APIs, SQLite, Drizzle,
filesystem access, network transport, and persistence implementation details.

Production local-first SQLite code supplies normalized facts to the engine and
uses the resulting projection for monetary budget views.

## Authority boundary

The budget engine derives financial values from canonical facts.

Canonical facts include:

- accounts and budget participation;
- categories and overspending policy;
- monthly category assignments;
- transactions and split lines;
- transfer relationships;
- credit-card payment-category relationships where applicable.

Derived values include:

- category activity;
- previous Available;
- Available;
- overspent state;
- group totals;
- monthly assigned and activity totals;
- income;
- previous overspending;
- Ready to Assign;
- rollover between months;
- credit-card funding movement.

Persistence may cache derived projections, but cached projections are
disposable. They are not authoritative facts.

## Core concepts

### Assigned

Money intentionally assigned to a category for a month.

### Activity

Net qualifying transaction activity for a category during a month.

Activity is derived from canonical transactions and split lines. Off-budget
accounts and ordinary transfers do not contribute ordinary category activity.

### Available

For each category:

    Available = Previous Available + Assigned + Activity

### Ready to Assign

Budget-level money available for assignment after income, assignments,
overspending policy, and chronological rollover have been applied.

## Authoritative projection

`projection/projectBudget.ts` provides the pure projection boundary.

`projectBudget()`:

- accepts canonical facts;
- uses integer minor units;
- validates dates and references;
- validates split conservation;
- projects months chronologically;
- derives category and group totals;
- applies overspending rollover policy;
- handles on-budget versus off-budget participation;
- excludes ordinary transfers from category activity;
- supports explicit credit-card behaviour.

The local-first SQLite adapter in
`apps/web/src/features/persistence/localFirst/sqliteBudgetProjectionAdapter.ts`
maps normalized persistence facts into this contract.

The local-first worker owns persistence-level projection invalidation and
caching. Those mechanisms must not move budgeting mathematics into SQLite
code.

## Month rollover and overspending

Overspending behaviour is explicit per category.

Supported policies are:

- `carry-category` — a negative category balance remains with that category in
  the following month;
- `reduce-next-month` — the category starts the following month at zero and the
  overspending reduces the following month's Ready to Assign.

Positive Available rolls forward to the same category.

Policies may change by month. Projection applies the policy that governed the
closing category state when determining the following month's rollover.

The older `rolloverBudgetMonth()` service remains available for callers that
use the earlier domain model. Its default remains `reduce-next-month`, while
callers may explicitly request `carry-category`.

## Covering overspending

Covering overspending is an explicit command that moves assigned money between
categories.

The application exposes this through the budget workspace and persistence
boundary. The command changes canonical assignment facts; subsequent monetary
state is obtained again through the authoritative projection boundary.

Reusable package services such as `coverOverspending()` and
`applyOverspendingDecision()` remain behavioural helpers, but they do not
replace `projectBudget()` as the production projection authority.

## Credit-card behaviour

The authoritative projection supports two explicit policies:

- `manual` — card purchases affect their spending categories while card
  transfers do not automatically create payment-category activity;
- `payment-funding` — funded card spending moves eligible money into the mapped
  payment category and card payments reduce that category appropriately.

Payment funding is bounded by money available to fund the purchase.

Credit-card policy belongs in the engine. Persistence and UI code select and
supply policy; they must not independently reproduce its financial arithmetic.

## Projection reconciliation

`projection/reconcileBudgetProjection.ts` compares projected results with
external or imported source evidence.

Import-provided calculated values are reconciliation evidence, not an ongoing
financial authority. After import, the engine projection is derived from the
canonical facts stored for the budget.

## Goals and future-month validation

The package also contains reusable goal and validation services, including
`calculateGoalProgress()` and `validateFutureMonth()`.

These services remain useful domain capabilities but are separate from the
authoritative month projection contract unless their facts directly participate
in projection.

## Reports and analytics

`packages/budget-engine` contains reusable report calculations including:

- account balances;
- net worth;
- spending by category;
- budget versus actual.

The web application also has active reporting and dashboard workflows backed by
the authoritative local-first query layer.

Reporting must consume canonical or authoritative projected financial data. A
report must not become an independent source of budgeting policy.

## Legacy and compatibility services

`packages/budget-engine` predates the current local-first projection
architecture and still contains service APIs used by tests and compatibility
paths.

Their continued presence does not make them separate calculation authorities.

When changing financial behaviour:

1. determine whether the rule belongs in `projectBudget()`;
2. update the authoritative projection first;
3. keep compatibility helpers behaviourally aligned where they remain required;
4. avoid introducing duplicate financial rules into UI or persistence layers.

## Rules for new budget-engine code

New financial calculations should:

1. Accept explicit plain facts rather than reading persistence directly.
2. Use integer minor units across authoritative projection boundaries.
3. Return deterministic plain values or typed results.
4. Avoid React, browser, SQLite, network, and filesystem dependencies.
5. Make rollover, transfer, account-participation, split, and credit-card rules explicit.
6. Include scenario and invariant tests.
7. Preserve source/import values as reconciliation evidence rather than authoritative calculated state.
8. Keep persistence caches disposable and reproducible from canonical facts.
