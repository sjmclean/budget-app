# Testing strategy

The generated per-file audit is `tests/test-audit.json`; its readable summary is `TEST-AUDIT-SUMMARY.md`. Regenerate both with `pnpm test:audit` whenever tests or supported commands change.

The repository contains a large historical test collection plus newer feature-based suites. Historical tests are classified so that a failing roadmap assertion is not confused with a correctness regression.

## Test classifications

- **required** — part of the correctness gate and expected to pass.
- **investigate** — currently failing behavioural, regression, contract, or performance tests whose meaning must be reviewed before reclassification.
- **pending** — structural or UI milestone assertions that describe unfinished or changed work. They do not gate correctness and should eventually be replaced by behavioural tests or retired.
- **retired** — expectations that conflict with current product decisions. They are retained temporarily for traceability and are not run by default.
- **quarantined** — empty or non-executable placeholders.

The classification source of truth is `tests/legacy-test-classification.json`. New legacy tests must be added to that file; the runner fails when it finds an unclassified test.

An empty investigate or roadmap suite is successful and reports 0 selected, 0 passed, and 0 failed. This distinguishes a resolved queue from a runner failure.

## Commands

```bash
# Supported suite interface
pnpm test
pnpm test:required
pnpm test:unit
pnpm test:integration
pnpm test:contracts
pnpm test:import
pnpm test:transfers
pnpm test:scheduled
pnpm test:budget
pnpm test:persistence
pnpm test:migrations
pnpm test:investigate
pnpm test:roadmap
pnpm test:all

# Required correctness baseline plus feature suites
pnpm test:all

# Required historical baseline only
pnpm test:legacy

# Current unresolved failures only
pnpm test:legacy:investigate

# Roadmap/structural expectations only
pnpm test:legacy:pending

# Every active historical test (required + investigate + pending)
pnpm test:legacy:all

# Classification summary
pnpm test:legacy:summary

# Filter by domain, kind, status, or filename
node scripts/run-legacy-tests.mjs --status=investigate --domain=import
node scripts/run-legacy-tests.mjs --kind=contract --match=sqlite
```

## Current baseline

After the Stage 4 review of every investigate and pending file:

- 347 tests are required.
- No tests remain classified as investigate or pending.
- 132 historical files are retired with explicit reasons and remain available for traceability.
- 4 empty files remain quarantined.
- Per-file pending decisions are recorded in `TEST-PENDING-RESOLUTION.md`.

Passing a test once does not prove that its assertions are valuable. During migration, required tests should still be reviewed for duplication, brittleness, and behavioural relevance.

## Migration order

1. Review the four quarantined placeholders and either implement or retire them.
2. Continue moving required tests into domain folders and remove release-number naming as each coherent domain is migrated.
3. Build adapter-parameterised persistence contract suites.
4. Expand backup/restore and undo/redo behavioural matrices.
5. Add roadmap tests only when they state stable, user-observable acceptance criteria.

## Shared test builders and scenarios

New and migrated behavioural tests should avoid repeating repository wiring and basic entity creation.

- `tests/support/builders/domainBuilders.ts` contains lightweight domain-object builders with stable test defaults.
- `tests/support/persistence/sqliteBudgetScenario.ts` creates an isolated SQLite-backed budget scenario and exposes repositories plus concise helpers for budgets, accounts, categories, payees, transactions, and transfers.
- `tests/support/scheduledTransactionHarness.ts` remains the feature-specific harness for browser-persistent scheduled transactions.

Prefer a scenario that expresses the business setup:

```ts
const scenario = SqliteBudgetScenario.create();
const budget = await scenario.budget();
const checking = await scenario.account(budget);
const groceries = await scenario.category(
  await scenario.categoryGroup(budget, "Food"),
  "Groceries",
);
```

Tests should assert observable behaviour rather than only logging repository output. Do not move every legacy test at once; migrate a coherent feature family whenever it is edited or consolidated.

## Shared assertions and fixtures

Use `tests/support/assertions` for recurring business invariants rather than repeating low-level assertion sequences. Current helpers cover budget/category month fields, conservation of assigned money, and split balancing.

Use `tests/support/fixtures/budgetMonthFixture.ts` for concise, deterministic budget-month setup. Add feature-specific fixtures only when they remove meaningful repetition; do not hide the behaviour under test.

`SqliteBudgetScenario.create()` creates a unique temporary directory and database. Prefer `withSqliteBudgetScenario(async (scenario) => { ... })`, which guarantees cleanup in `finally`, including assertion failures. Explicit paths remain an opt-in compatibility mechanism whose lifecycle belongs to the caller.

## Naming, placement, and retirement

Unit tests cover deterministic functions; integration tests cross service, repository, parser, or persistence boundaries; contracts apply to every implementation of a port; regressions pin observed defects or fidelity risks; structural tests inspect source layout; roadmap tests describe future behaviour and never gate correctness.

New behavioural files should use feature names and `.test.ts` under a feature directory, not release-number names. Use focused builders with deterministic defaults and explicit overrides. Retire a historical test only when it conflicts with a documented decision, has equivalent or stronger replacement coverage, or tests an obsolete detail with no behavioural value. Record the replacement or concrete rationale; never retire or mark a behavioural failure pending merely to make a command pass.
