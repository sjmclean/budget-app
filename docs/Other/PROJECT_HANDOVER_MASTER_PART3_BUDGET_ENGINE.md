# PROJECT HANDOVER MASTER --- PART 3

# Budget Engine Technical Specification

## Purpose

The Budget Engine is responsible for determining the financial state of
the budget for every month. It must be deterministic, repeatable and
independent of the UI.

## Design Principles

-   Financial correctness is always preferred over convenience.
-   Calculations should be reproducible from stored data.
-   Business logic belongs in services/domain models.
-   UI should only display calculated state.

------------------------------------------------------------------------

# Budget Month Lifecycle

For every month the engine determines:

-   Ready To Assign
-   Budgeted amounts
-   Activity
-   Available balances
-   Overspending
-   Rollovers

The engine should be capable of recalculating an entire budget from
persisted data.

------------------------------------------------------------------------

# Category Identity

One of the most important architectural decisions is that Category IDs
are authoritative.

Names are presentation.

Imports may rename categories.

Historical transactions continue referencing the immutable Category ID.

This decision avoids corruption when categories are renamed or merged.

------------------------------------------------------------------------

# Ready To Assign

Ready To Assign is calculated rather than stored whenever possible.

Inputs include:

-   account balances
-   inflows
-   budget allocations
-   transfers
-   adjustments

Future work should continue to avoid duplicated derived state.

------------------------------------------------------------------------

# Budget Activity

Activity is derived from register transactions.

Future roadmap:

-   Click activity to inspect contributing transactions.
-   Month-to-month comparisons.
-   Drill-down reporting.

------------------------------------------------------------------------

# Rollovers

Carry-forward must preserve correctness.

Recent work fixed rollover defects involving monthly balances.

Regression tests should accompany any rollover change.

------------------------------------------------------------------------

# Overspending

Pinned improvements:

-   Better colouring
-   Better explanations
-   Workflow improvements
-   Notification review
-   Dedicated reporting

------------------------------------------------------------------------

# Credit Cards

Credit card payment handling remains part of the Budget Engine rather
than Register presentation.

Future work:

-   Better payment category UX
-   Payment recommendations
-   Historical payment reporting

------------------------------------------------------------------------

# Future Goals System

Planned subsystem:

-   Savings goals
-   Monthly funding targets
-   Target dates
-   Progress indicators
-   Forecasting

Goals should extend the Budget Engine without complicating the existing
budgeting workflow.

------------------------------------------------------------------------

# Engineering Rules

Never optimise away correctness.

Budget calculations should always be explainable.

Users must be able to understand why every figure exists.

------------------------------------------------------------------------

# Proposed Future ADRs

ADR-013 Ready To Assign remains derived.

ADR-014 Budget calculations are deterministic.

ADR-015 Category identity is immutable.

ADR-016 Budget activity is transaction-derived.

End of Part 3.
