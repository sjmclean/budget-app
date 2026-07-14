# PROJECT HANDOVER MASTER --- PART 21

# Known Issues, Lessons Learned & Engineering Retrospective

## Purpose

This document captures institutional knowledge gained during development
so future contributors understand what has gone wrong before, why it
happened, and how to avoid repeating it.

------------------------------------------------------------------------

# Major Bugs Encountered

## Budget rollover defects

**Symptoms** - Incorrect month opening balances. - Mortgage category
exposed rollover inconsistencies.

**Root cause** - Month transitions were not consistently derived from
the prior month's closing state.

**Resolution** - Reworked rollover logic and added regression coverage.

**Lesson** Budget calculations must always be deterministic and
reproducible.

------------------------------------------------------------------------

## Scheduled transaction duplicate generation

**Symptoms** - Duplicate scheduled transactions occasionally appeared in
registers.

**Root causes** - Multiple generation paths. - Missing idempotency
protection. - In-flight generation races.

**Resolution** - Generation locking. - Materialisation fidelity
improvements. - Additional regression tests.

**Lesson** Scheduled generation must be safe to execute repeatedly.

------------------------------------------------------------------------

## YNAB4 import fidelity

Issues discovered: - Category ID preservation - Scheduled transaction
mapping - Budget activity alignment - Transfer edge cases

Resolution: Importer updated to preserve canonical identifiers and
budgeting intent.

------------------------------------------------------------------------

## Dashboard calculations

Income calculations initially counted category income incorrectly.

Resolution: Exclude category income that bypasses Ready To Assign.

------------------------------------------------------------------------

## Transaction intake

Lessons: - Conservative matching is preferable. - False positives damage
user trust. - Seven-day matching window became the preferred default.

------------------------------------------------------------------------

# UX Lessons

-   Reduce clutter.
-   Use progressive disclosure.
-   Desktop workflows may expose additional shortcuts.
-   Keep mobile parity.

Pinned UX reviews: - Budget screen - Register toolbar - Scheduled
transaction editor - Reports navigation - Tag management

------------------------------------------------------------------------

# Engineering Lessons

## Regression-first

Every production bug should receive a regression test.

## Small targeted patches

Prefer narrowly scoped fixes over sweeping refactors.

## Preserve compatibility

Migration quality is more valuable than importer cleverness.

------------------------------------------------------------------------

# Technical Debt

-   Bundle size optimisation.
-   Additional code splitting.
-   Reporting engine expansion.
-   Planning engine.
-   Merchant Knowledge implementation.
-   Cloud synchronisation.

------------------------------------------------------------------------

# Future Risks

-   Concurrent editing.
-   Large attachment libraries.
-   Mobile synchronisation conflicts.
-   Long-running budget performance.
-   Calendar edge cases.
-   Time zone handling.

------------------------------------------------------------------------

# Things We'd Do Again

-   Local-first.
-   Canonical model.
-   Register as ledger.
-   Extensive automated tests.
-   Portable budget philosophy.

------------------------------------------------------------------------

# Things We'd Improve Earlier

-   Merchant Knowledge.
-   Better ADR documentation.
-   More integration tests.
-   Scheduled transaction audit history.
-   Performance instrumentation.

------------------------------------------------------------------------

# Advice For Future Developers

1.  Preserve financial correctness above all else.
2.  Never merge features without regression coverage.
3.  Maintain importer fidelity.
4.  Keep architecture engine-based.
5.  Minimise hidden behaviour.
6.  Treat migrations as first-class features.
7.  Respect existing roadmap decisions before redesigning subsystems.

End of Part 21.
