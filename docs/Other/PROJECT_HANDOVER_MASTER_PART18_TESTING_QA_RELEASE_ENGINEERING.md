# PROJECT HANDOVER MASTER --- PART 18

# Testing, QA & Release Engineering

## Purpose

This document defines the quality standards, testing philosophy and
release process for the Budget App. Financial correctness is treated as
a non-negotiable requirement.

------------------------------------------------------------------------

# Quality Philosophy

Guiding principles:

-   Regression-first development
-   Financial correctness over feature count
-   Deterministic behaviour
-   Reproducible builds
-   Small, reviewable changes

------------------------------------------------------------------------

# Testing Pyramid

## Unit Tests

Verify:

-   budget calculations
-   register calculations
-   scheduled transaction logic
-   import parsing
-   reporting calculations

These should execute quickly and isolate business logic.

------------------------------------------------------------------------

## Integration Tests

Exercise complete workflows:

-   budget creation
-   transaction entry
-   imports
-   scheduled transaction generation
-   report generation
-   month rollover

------------------------------------------------------------------------

## Regression Tests

Every bug fixed should gain a permanent regression test.

Recent examples include:

-   Mortgage rollover correctness
-   Scheduled transaction duplicate prevention
-   Scheduled category ID fidelity
-   Materialisation fidelity
-   Transaction flag removal
-   Dashboard income calculation
-   Merchant alias handling

Regression tests protect architectural decisions.

------------------------------------------------------------------------

# Financial Correctness

Changes affecting money require validation of:

-   balances
-   category activity
-   Ready To Assign
-   transfers
-   split transactions
-   reconciliation
-   scheduled transactions

Correct numbers always outweigh implementation elegance.

------------------------------------------------------------------------

# Import Testing

Every importer should verify:

-   parsing
-   canonical mapping
-   transfers
-   split fidelity
-   scheduled transaction fidelity
-   migration correctness

Importer-specific bugs become permanent regression tests.

------------------------------------------------------------------------

# UI Verification

UI work should verify:

-   accessibility
-   keyboard navigation
-   responsive layouts
-   interaction consistency
-   performance

Visual polish must not compromise correctness.

------------------------------------------------------------------------

# Build Requirements

A change is not considered complete until:

-   tests pass
-   TypeScript compiles
-   production build succeeds
-   no new regressions are introduced

------------------------------------------------------------------------

# Patch Workflow

Preferred workflow:

1.  Investigate
2.  Design
3.  Produce focused patch
4.  Apply
5.  Execute regression suite
6.  Build
7.  Manual verification

Small patches are preferred over broad refactors.

------------------------------------------------------------------------

# Release Checklist

Before release:

-   all regression tests pass
-   production build succeeds
-   no critical known defects
-   release notes updated
-   migrations validated

------------------------------------------------------------------------

# Continuous Integration

Future CI pipeline should include:

-   linting
-   unit tests
-   integration tests
-   regression suite
-   production build
-   packaging
-   release artifacts

------------------------------------------------------------------------

# Versioning

Adopt predictable semantic versioning.

Every release should clearly identify:

-   new features
-   bug fixes
-   architectural changes
-   migration requirements

------------------------------------------------------------------------

# Engineering Culture

Contributors are encouraged to:

-   preserve architectural integrity
-   write documentation
-   expand regression coverage
-   avoid unnecessary complexity
-   favour maintainability

------------------------------------------------------------------------

# Long-Term Roadmap

Future QA improvements:

-   automated UI testing
-   performance benchmarks
-   large-budget stress tests
-   sync conflict simulations
-   mobile test automation
-   nightly regression runs
-   release candidate validation

The objective is a budgeting application that users can trust with years
of financial history.

End of Part 18.
