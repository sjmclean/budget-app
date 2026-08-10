# Budget engine consolidation audit

Date: 5 August 2026

## Outcome

Budget App does not currently have one authoritative budgeting engine in the production local-first runtime. Canonical transactions live in SQLite, but budget-month values are mostly imported JSON snapshots. Several other layers independently recalculate subsets of the same financial state.

The budget engine must become the only component allowed to derive financial values. Persistence should store facts and versioned projection caches; importers should map source facts and validate the engine's projection; UI code should format and dispatch commands only.

## Confirmed production failures

1. A YNAB4 category configured to carry a negative July balance can show zero in August because `localBudget.worker.ts::readBudgetMonth()` reads the August snapshot and never projects rollover from July.
2. Editing a transaction changes `local_transactions`, but no budget projection is invalidated or rebuilt. August activity and Available therefore remain stale.
3. SQLite already has a category/month transaction query, but `useBudgetWorkspace.ts` blocks activity drill-down with `assertBrowserBudgetFeatureAvailable()` and the SQLite budget persistence adapter does not route the drill-down service to that query.
4. Attachments remain on the legacy register mutation path. `useAccountRegister.ts::runMutation()` intentionally rejects that path for SQLite budgets.

## Current calculation authorities

| Layer | Calculations performed | Production status | Problem |
| --- | --- | --- | --- |
| `packages/budget-engine` | Available, assignment, activity, rollover, overspending, credit-card movement | Not used by local-first SQLite budget views | Its rollover always removes negative category balances and cannot represent `carry-category`. |
| `apps/web/.../budgetViewService.ts` | Activity projection, rollover, Ready to Assign, totals, overspending policies | Legacy/key-value path | More complete YNAB4 carry semantics than the package engine, but tied to browser services and mutable views. |
| `apps/web/.../budgetMoneyMovement.ts` | Category and group totals, Available, Ready to Assign | UI command path | Duplicates engine arithmetic. |
| `apps/web/.../ynab4/mapYnab4BudgetMonths.ts` | Imported activity, rollover, Available and totals | Import only | Persists calculated snapshots as if they were authoritative facts. |
| `localBudget.worker.ts::readBudgetMonth()` | Reapplies assignments and recomputes local totals | Production SQLite read path | Uses stale snapshot activity and previous Available; does not query transactions or roll months forward. |
| Older application services | Mutate category months alongside transactions | Repository/application path | Not wired to the browser local-first runtime and uses a different persistence model. |
| React pages/selectors | Additional totals and overspending presentation decisions | Production UI | Financial rules can drift into presentation code. |

## Direct evidence

### SQLite month reads are snapshot based

`local_budget_months.view_json` contains the complete imported `BudgetMonthView`. `readBudgetMonth()` parses it, overlays `local_budget_assignments`, and calculates:

```text
available = snapshot.previousAvailable + current assignment + snapshot.activity
```

It does not derive activity from `local_transactions` or `local_transaction_splits`. It does not load the preceding month. Consequently, transaction updates cannot affect a budget view.

### Transaction writes do not invalidate projections

SQLite add, batch, update, move and delete operations write transaction rows and an outbox mutation, then notify synchronization listeners. None records the earliest affected budget month or invalidates a budget projection.

A date, amount, category, account-participation or split edit can affect one or two activity months and every later rollover month, yet no rebuild occurs.

### Existing tests validate different engines

- `milestone3-sqlite-budget-view.mjs` proves the retired server SQLite engine recalculates after transaction edits.
- `v3237-budget-engine-validation.ts` proves legacy `budgetViewService` rollover behaviour.
- `v3143-ynab4-overspending-carryover-semantics.ts` proves the import mapper creates correct snapshots.
- No required test proves the production local-first worker converges after add, edit, delete, recategorisation, date change, split change and cross-month rollover.

Passing tests therefore do not establish the runtime invariant the user expects.

## Target authority model

### Canonical facts stored in SQLite

- accounts and on-budget participation;
- transactions, transfer links and split lines, in integer minor units;
- category and group identity, order, archived state and overspending policy;
- monthly category assignments;
- budget metadata and currency;
- credit-card payment-category relationships;
- attachment metadata and content references.

### Values derived only by the budget engine

- category activity;
- category previous Available and Available;
- group and budget totals;
- income for month and Ready to Assign;
- previous overspending;
- positive and policy-controlled negative rollover;
- credit-card payment-category activity and funding movement;
- overspent state;
- category activity drill-down totals.

Import-provided calculated values are comparison evidence, not ongoing source data.

## Required engine contract

The consolidated engine should be a pure package with no browser, React, OPFS, network or repository dependency:

```ts
interface BudgetProjectionInput {
  budget: BudgetFacts;
  accounts: readonly AccountFact[];
  categories: readonly CategoryFact[];
  assignments: readonly AssignmentFact[];
  transactions: readonly TransactionFact[];
  fromMonth: string;
  throughMonth: string;
}

interface BudgetProjectionResult {
  months: readonly BudgetMonthProjection[];
  diagnostics: readonly BudgetProjectionDiagnostic[];
}

function projectBudget(input: BudgetProjectionInput): BudgetProjectionResult;
```

All money crossing this boundary must use integer minor units. Date and month values must use validated calendar strings.

## Projection rules

For each month in chronological order:

1. Aggregate transaction and split activity by category from on-budget accounts only.
2. Exclude transfers from ordinary category activity unless the engine explicitly routes a credit-card payment category.
3. Compute current income assigned to Ready to Assign.
4. Load the prior projection.
5. Carry positive Available into the same category.
6. For negative Available:
   - `carry-category`: carry the negative amount into the category;
   - `reduce-next-month`: reset category carry to zero and reduce next month's Ready to Assign.
7. Apply current assignments and activity.
8. Apply credit-card purchase/payment rules.
9. Derive all category, group and budget totals.

No caller may supply `activity`, `previousAvailable`, `available`, `isOverspent`, or aggregate totals as authoritative inputs.

## Recalculation and invalidation

Transaction mutations must capture both the old and new record. The earliest affected month is the minimum of the old and new transaction months. Reprojection begins there and continues until:

- the latest navigable/materialized month is rebuilt; or
- a projection is byte-for-byte financially equal to its prior cached result and no later invalidation exists.

Category policy or assignment changes invalidate that month and all later months. Account participation changes invalidate the earliest month containing a transaction for that account.

The first implementation should favour correctness by rebuilding forward. Projection caching and early-stop optimization should follow only after invariant tests pass.

## Persistence design

Replace `local_budget_months.view_json` as an authority with normalized facts:

- `local_budget_assignments(budget_id, month, category_id, assigned_minor)`;
- category policy on `local_categories` or a versioned policy table;
- optional `local_budget_projection_cache` containing engine version, input revision and projection JSON;
- optional `local_budget_dirty_months` containing the earliest invalid month per budget.

Cached projections must be disposable and reproducible from facts. A schema or engine-version mismatch must rebuild rather than trust old output.

## Activity drill-down

The existing SQLite category transaction query should become an engine/query projection companion. It must include:

- positive and negative categorized transactions;
- split lines;
- current category names;
- transfer exclusions consistent with projection rules;
- account participation filtering consistent with projection rules;
- totals whose sum exactly equals projected category activity.

The UI safety guard should be removed only after this equality is tested.

## Attachments

Attachments are not part of financial projection and should not delay engine consolidation. Implement them as a separate SQLite domain:

- attachment metadata linked to canonical transaction IDs;
- content in the existing content-addressed browser store;
- add/remove mutations through `accountRegisterQueries`;
- baseline and relay inclusion;
- cleanup after failed writes and transaction deletion.

## Mandatory invariants

1. `available = previousAvailable + assigned + activity` for every category.
2. Group totals equal the sum of their categories.
3. Budget totals equal the sum of groups/categories according to the documented Ready to Assign model.
4. Activity drill-down rows sum exactly to projected activity.
5. Adding, editing, deleting, moving, recategorizing or splitting a transaction produces the same projection as rebuilding from scratch.
6. Moving a transaction between months updates both months and all affected later rollovers.
7. `carry-category` and `reduce-next-month` produce distinct, tested results.
8. Tracking/off-budget transactions do not change the budget.
9. Ordinary transfers have zero category activity.
10. Credit-card purchases and payments conserve money under the selected compatibility policy.
11. Import followed by a full projection matches YNAB4 source evidence within the configured tolerance.
12. Replicas receiving the same facts produce identical projections.

## Test audit actions

- Add production local-first integration tests; do not reuse the retired server store as proof.
- Convert snapshot assertions into fact-to-projection invariant tests.
- Run the same scenario table against the pure engine and the SQLite adapter.
- Add property tests for edit/rebuild equivalence and money conservation.
- Add import reconciliation tests comparing source evidence with engine output.
- Keep legacy tests only as behavioural references until each is replaced, then reclassify deliberately in `tests/test-audit.json`.

## Implementation phases

### Phase 1 — engine contract and scenario matrix

Correct `packages/budget-engine` rollover semantics, adopt integer minor units, add split/transfer/account-participation activity rules, and establish pure invariant tests. No UI cutover.

### Phase 2 — SQLite fact adapter and projection query

Read normalized facts from local SQLite and project a requested month through the package engine. Compare new output with the old snapshot path behind a diagnostic flag.

### Phase 3 — authoritative cutover and invalidation

Route budget reads through the engine, record dirty months on every relevant mutation, rebuild forward, and stop writing calculated import snapshots as authority.

### Phase 4 — activity drill-down

Route drill-down through SQLite, remove the incorrect feature guard, and assert drill-down/projection equality.

### Phase 5 — credit cards, import reconciliation and performance

Complete credit-card policy scenarios, validate YNAB4 imports against projections, add indexes and disposable projection caching, and benchmark large budgets.

### Phase 6 — attachment capability

Add SQLite attachment metadata mutations, content lifecycle, relay/baseline support and UI integration.

## Immediate decision

Do not patch August snapshot values directly. Begin with Phase 1 and make the pure engine capable of expressing the application's required policies before wiring it into SQLite.

## Phase 1 implementation boundary

Phase 1 adds `projectBudget()` as a pure package-level projection contract. It deliberately does not switch production budget reads yet. Its inputs are canonical facts only: accounts and budget participation, categories and overspending policy, assignments, transactions and split lines. All money uses safe integer minor units.

The projection owns chronological rollover and produces category, group and month totals. It rejects invalid dates, unknown references, duplicate facts, non-integer money and split transactions whose lines do not conserve the parent amount. Transfers and off-budget accounts do not produce category activity. Split parents do not duplicate their split-line activity.

The legacy `rolloverBudgetMonth()` API remains compatible: callers that do not provide policy retain `reduce-next-month`. Callers may now explicitly select `carry-category` per category.

Phase 1 verification is:

```sh
pnpm verify:milestone4:budget-engine-projection
```

Production integration, invalidation and replacement of `view_json` remain Phase 2 and Phase 3 work. This separation prevents an unverified engine from silently changing live budget results.

## Phase 2 implementation boundary

Phase 2 adds a diagnostic SQLite-to-engine adapter without changing the authoritative read path. Imported or replicated month views now populate normalized assignment and category-policy facts. Existing databases are backfilled idempotently: missing facts are inserted, while later assignment overrides are preserved.

The local SQLite worker can answer `getBudgetProjectionDiagnostic` for a requested month. It reads accounts, category identities, assignments, policies, transactions and split lines from normalized tables, converts display-unit snapshot values at the boundary, projects chronologically through `projectBudget()`, and reports exact minor-unit differences against the stored month view.

Diagnostics are opt-in. Set this browser storage key and reload:

```js
localStorage.setItem(
  "budget-app.local-first.budget-engine-diagnostics",
  "true",
);
```

When enabled, differences are written to the browser console. A diagnostic failure or mismatch never replaces or mutates the view returned to the UI. Disable it with:

```js
localStorage.removeItem(
  "budget-app.local-first.budget-engine-diagnostics",
);
```

Phase 2 verification is:

```sh
pnpm verify:milestone4:sqlite-budget-projection-adapter
```

Making projections authoritative, recording dirty months, and rebuilding forward after writes remain Phase 3 work.

## Phase 3 implementation boundary

Phase 3 makes the package budget engine authoritative for monetary budget reads.
The stored month view remains a metadata and bootstrap record: it supplies month
labels, category grouping, display metadata and the first projection boundary.
Its calculated assigned, activity, available, rollover and Ready to Assign values
are replaced at read time with the engine projection.

Every mutation that can affect a budget projection records the earliest dirty
month and removes cached projections for that month and every later month. This
includes transaction create, edit, move and delete operations; batch imports;
assignment and overspending-policy changes; account participation changes; and
category merges. The next read rebuilds the requested month chronologically from
normalized SQLite facts.

`local_budget_projection_cache` is disposable and versioned. It is never a fact
source and can be deleted or invalidated without losing user data.
`local_budget_projection_dirty` records invalidation state so later maintenance
and observability work can distinguish a current projection from one awaiting a
forward rebuild.

Category mutations reread the month through the authoritative boundary rather
than returning a locally patched snapshot. Projection errors fail closed instead
of silently showing stale budget figures.

Phase 3 verification is:

```sh
pnpm verify:milestone4:authoritative-budget-projection
```

Activity drill-down remains Phase 4. Phase 3 does not yet remove the stored
snapshot columns because they are still required as migration/bootstrap metadata.

## Phase 4 implementation boundary

Phase 4 routes category activity details to normalized local SQLite whenever the
budget-month capability is active. The imported-SQLite feature guard is removed;
legacy browser-key budgets retain their existing activity adapter.

The worker query applies the engine's activity rules: only on-budget accounts
participate, split parents are not counted in addition to their lines, ordinary
transfers and transfer split lines are excluded, and both inflows and outflows are
returned. Results are limited to 2,000 rows for a single category-month query.

Before returning data, the worker sums every drill-down row in integer minor
units and compares it with the authoritative category projection. A mismatch
fails closed rather than presenting details that disagree with the Budget screen.

Phase 4 verification is:

```sh
pnpm verify:milestone4:sqlite-category-activity-drilldown
```

## Phase 5 implementation boundary

Phase 5 makes credit-card behavior an explicit engine policy. `manual` remains
the default and preserves YNAB4's traditional treatment: purchases affect their
spending categories and transfers to cards do not create category activity.
`payment-funding` additionally moves the funded portion of a card purchase into
the mapped payment category, reverses that funding for refunds, and reduces the
payment category when an on-budget transfer pays the card. Funding is limited by
the spending category's available balance immediately before each purchase.

The SQLite adapter detects payment-funding only when managed payment categories
exist. YNAB4 imports without those categories therefore remain manual. Projection
cache version 2 prevents Phase 3 cached values from surviving the policy change.

The package now exposes `reconcileBudgetProjection()` for comparing YNAB4 source
evidence with engine output in exact minor units or an explicit tolerance. Phase
5 tests cover manual and payment-funded cards, source-evidence reconciliation,
refunds, payments and a deterministic 100,000-transaction projection benchmark.

SQLite adds a split-category lookup index and a projection cache-version index.
The cache remains disposable; normalized accounts, categories, assignments,
policies and transactions remain authoritative facts.

Phase 5 verification is:

```sh
pnpm verify:milestone4:budget-engine-phase5
```

The standalone benchmark is:

```sh
pnpm benchmark:milestone4:budget-engine
```
