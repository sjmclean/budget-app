# Investigate queue resolution

## Stage 3 update — 20 July 2026

The investigate queue is now empty. All seven Stage 2 items were resolved without moving unresolved behaviour to pending.

- `v146-budget-registry-foundation.ts`, `v147-active-budget-context.ts`, and `v157-budget-launcher.ts` were replaced by `tests/suites/budget/registry-lifecycle.test.ts`. The required replacement covers opaque unique identity, registry persistence, update/open/delete, and explicit active-budget selection. Historical slug IDs and automatic fallback selection are obsolete behavior.
- `v194-scheduled-split-drilldown.ts` was replaced by the scheduled lifecycle suite. Split lines are covered through creation, register-input cloning, and edit preservation. The removed flag field is not restored; current transaction tags are asserted instead.
- `v190-ynab4-budgeted-archived-category-activity-fidelity.ts`, `v2340-ynab4-category-view-fidelity.ts`, and `v2341-ynab4-category-sortable-index-fidelity.ts` now reflect the documented Actual-compatible mapping: hidden categories retain their qualified path, tombstoned categories are dropped, and activity is derived from imported transactions. All three are required and passing.

Domain verification: budget **41/41**, scheduled transactions **10/10**, and migrations **40/40**.

## Stage 2 update — 20 July 2026

The queue was reduced from 21 files to 7 unresolved files.

- `v3159-import-validator-extraction.ts` and `v3160-import-commit-extraction.ts` now use the current immutable import lifecycle fixture and are required/passing.
- Four historical matching wrappers, their aggregate, `v2410-import-match-thresholds.ts`, and the obsolete review aggregates/source-header assertion were replaced or retired with explicit reasons. Their confidence/recommendation assumptions conflict with the pinned neutral importer contract.
- `tests/suites/import/matching-reconciliation.test.ts` is the required behavioural replacement. It covers deterministic amount/date eligibility, resolved-merchant ordering, neutral evidence, multiple candidates, and one-time row consumption.
- `v3201-merchant-aware-reconciliation.ts` was replaced because built-in merchant normalisation now resolves the scenario that historically required injected knowledge.
- `v152-transaction-import.ts` was retired after its parsing, matching, validation, and commit responsibilities were covered by current required contracts; its removed `possible-match` state is no longer product behaviour.
- `v3224-transfer-reconciliation.ts` is required/passing. Resolved internal transfers match only linked transfer rows; unavailable destinations follow the established external-transaction fallback and may reconcile as ordinary transactions.

Those seven failures were carried into Stage 3 and resolved as documented above.

## Stage 1 baseline

All 21 investigate tests were executed on 20 July 2026. Result: **0 passed, 21 failed**. None was weakened, retired, or moved to pending to make the suite green. Items below remain non-gating until their stated resolution is completed.

| Test | Root cause / decision |
|---|---|
| `transaction-intake/matching/conservative-matching.ts` | Wrapper exposes the current false-positive match for equal amount plus nearby date. Merge into the import matching matrix; retain-investigate. |
| `transaction-intake/matching/match-assessment.ts` | Expected import, current result is match. Merge into matching assessment coverage; retain-investigate. |
| `transaction-intake/matching/merchant-normalisation.ts` | Current normalisation produces no positive payee evidence. Migrate to a merchant evidence matrix; retain-investigate. |
| `transaction-intake/matching/ranked-candidates.ts` | Ranking expectations differ from the current engine. Migrate to import matching; retain-investigate. |
| `transaction-intake/matching/run.ts` | Aggregate repeats child matching failures. Replace after child migration. |
| `transaction-intake/review/run.ts` | Aggregate contains historical review expectations. Replace with neutral behavioural UI contracts. |
| `transaction-intake/run.ts` | Top-level aggregate repeats matching/review failures. Replace after children migrate. |
| `v146-budget-registry-foundation.ts` | Historical registry contract differs from current implementation. Migrate into budget persistence contracts. |
| `v147-active-budget-context.ts` | Active-budget context expectation differs from current runtime. Migrate as a budget-isolation contract. |
| `v152-transaction-import.ts` | Predates the current candidate lifecycle. Replace with current parsing/commit behaviour. |
| `v157-budget-launcher.ts` | Predates current registry/context behaviour. Migrate with budget lifecycle tests. |
| `v190-ynab4-budgeted-archived-category-activity-fidelity.ts` | Diagnostic import passes but archived-category activity fidelity still fails. Retain regression pending activity-semantics resolution. |
| `v194-scheduled-split-drilldown.ts` | Historical drill-down expectation differs from current scheduled split shape. Migrate into scheduled split fidelity coverage. |
| `v2340-ynab4-category-view-fidelity.ts` | Imported activity is zero where source budget rows contain activity, changing available values. Retain regression. |
| `v2341-ynab4-category-sortable-index-fidelity.ts` | Category identity/order expectation differs from current import output. Retain regression pending source-order analysis. |
| `v2410-import-match-thresholds.ts` | Match thresholds differ from current engine. Merge with conservative/ranked candidate coverage. |
| `v2620-transaction-import-review-card-header.ts` | Brittle source-layout assertion expects historical review markup. Replace with neutral component behaviour; do not restore confidence/recommendation UI. |
| `v3159-import-validator-extraction.ts` | Fixture lacks `candidate.lifecycle.proposal`, causing `TypeError`. Fix fixture, then migrate to import validation. |
| `v3160-import-commit-extraction.ts` | Fixture lacks `candidate.lifecycle.proposal`, causing `TypeError`. Fix fixture, then migrate to commit/rollback. |
| `v3201-merchant-aware-reconciliation.ts` | Expected one merchant-aware match; current result is zero. Retain behavioural regression. |
| `v3224-transfer-reconciliation.ts` | Expected transfer; current result is new. Retain behavioural regression; transfer reconciliation remains unresolved. |

Resolution order: repair obsolete lifecycle fixtures; consolidate matching/merchant/transfer matrices; resolve YNAB4 activity semantics; replace review source assertions; then migrate budget registry/context contracts.
