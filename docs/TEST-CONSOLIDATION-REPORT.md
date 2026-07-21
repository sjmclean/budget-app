# Test consolidation report

## Stage 4 — pending and structural resolution

- Executed all **115 pending files**: 0 passed and 115 failed.
- Migrated the payee-alias suggestion fixture to the current import lifecycle and promoted it after passing.
- Retired 114 historical files without deleting them: 101 obsolete source-layout assertions, two source-text performance proxies, and eleven superseded behavioral/regression fixtures.
- Added `TEST-PENDING-RESOLUTION.md`, containing a decision and reason for every reviewed file.
- No historical file expressed a distinct future capability with stable user-observable acceptance criteria, so none was relabeled as executable roadmap coverage merely to preserve a pending count.
- Updated empty investigate/roadmap commands to succeed truthfully with 0 selected, 0 passed, and 0 failed.
- Current audit: **483 files** — 347 required, 132 retired, and 4 quarantined; no pending or investigate entries.

## Stage 3 — investigate queue completion

- Resolved all seven remaining investigate items; the audit now contains **zero investigate files**.
- Added a required budget registry lifecycle suite covering opaque identity and explicit active-budget selection.
- Expanded scheduled lifecycle coverage for split preservation through edits and current tag behavior.
- Promoted three corrected YNAB4 fidelity regressions to required after aligning fixtures with documented Actual-compatible category semantics.
- Verified required domains: budget **41 passed**, scheduled transactions **10 passed**, migrations **40 passed**; no failures.
- Current audit: **483 files** — 346 required, 115 pending, 18 retired, and 4 quarantined.
- Verified the complete required gate: **346 passed, 0 failed**.
- Added a reusable temporary SQLite database helper and migrated nine legacy `/tmp` tests to it.
- Closed SQLite clients before recursive cleanup in five existing temporary-directory tests and repaired one direct-database integrity test.
- Updated the payee persistence test to assert the current complete persisted record contract rather than equality with a minimal creation input.

## Stage 2 — importer consolidation

- Migrated historical confidence-era matching coverage into `tests/suites/import/matching-reconciliation.test.ts` with shared deterministic builders.
- Preserved the neutral importer rule: no confidence ratings and no recommendation labels in review UI.
- Repaired two obsolete lifecycle fixtures and promoted both contracts to required.
- Verified transfer reconciliation: resolved internal transfers match only linked transfer rows, while missing destinations retain the established external-transaction fallback.
- Reduced the investigate queue from 21 failures to 7 without reclassifying any unresolved behavioural regression as pending.
- Increased the audited inventory to 482 files by adding one consolidated feature suite.
- Verified the required import domain: **67 files passed, 0 failed**.
- Verified the remaining investigate queue: **0 passed, 7 failed**, with all failures retained for their documented budget, scheduled-split, or YNAB4 fidelity work.
- Verified TypeScript and the production web build successfully.
- Migrated five SQLite-backed import tests away from shared POSIX `/tmp` paths or unclosed connections; all now use unique temporary directories with `finally` cleanup.

## Completed stage

This safe first stage establishes trustworthy discovery and execution; it does not claim that all historical tests have been migrated.

- Audited 481 executable test files into `tests/test-audit.json`.
- Generated `TEST-AUDIT-SUMMARY.md` reproducibly.
- Executed and documented all 21 investigate failures.
- Added classification/type/domain-aware execution with JSON timing reports.
- Fixed Windows `spawn EINVAL` in feature and legacy runners.
- Hardened SQLite scenarios with unique temporary directories, closed connections, recursive idempotent cleanup, and a `try/finally` scenario helper.
- Replaced one Windows-incompatible shared `/tmp` scheduled-test database.
- Added shared persistence, transfer, rollback, fingerprint, duplicate, and budget-isolation assertions.
- Added compact supported commands while preserving legacy compatibility aliases.
- Verified scheduled transactions: **10 files passed, 0 failed**; feature suites: **17 tests passed, 0 failed**.

## Audit headline

- Required/feature: 338
- Investigate: 21
- Pending: 115
- Quarantined: 4
- Retired: 3
- Files without recognised assertions: 127
- Exact normalised duplicate candidates: 5

These are review signals. No test was automatically deleted or retired.

## Remaining work

- Review and migrate the 115 pending roadmap/structural expectations.
- Migrate import, transfer, budget, persistence, backup/restore, undo/redo, YNAB4, and Actual families.
- Replace or move 115 pending structural expectations.
- Review 127 assertion-free candidates and five duplicates individually.
- Add adapter-parameterised persistence contracts and missing import/backup/migration builders.
- Add coverage only after selecting a provider; no misleading `test:coverage` command is advertised.
- Reduce historical version aliases only after downstream automation usage is known.

Pinned importer neutrality was preserved. Register-level merge was not implemented. No behavioural failure was reclassified to manufacture a green gate.

## YNAB4 execution-path consolidation

Removed the unused direct `.ynab4` package-to-database executor and its two
implementation-specific tests (`v169` and `v170`). The supported production
path is now documented in `YNAB4-IMPORT-ARCHITECTURE.md`. The legacy YNAB CSV
stack remains isolated pending an explicit support decision.
