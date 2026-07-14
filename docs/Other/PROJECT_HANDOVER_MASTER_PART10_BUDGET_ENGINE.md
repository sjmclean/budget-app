# PROJECT HANDOVER MASTER --- PART 10

# Budget Engine Technical Specification

## Overview

The Budget Engine is the financial heart of the application. Every
feature that affects money must preserve the engine's invariants.

------------------------------------------------------------------------

# Design Goals

-   Deterministic calculations
-   Historical accuracy
-   Repeatable recalculation
-   No hidden state
-   Import-source independence

------------------------------------------------------------------------

# Monthly Budget Model

Each month stores:

-   Budgeted
-   Activity
-   Available

Available is derived rather than manually edited.

------------------------------------------------------------------------

# Ready To Assign

Ready To Assign (RTA):

-   receives income
-   funds categories
-   decreases when budgeting occurs
-   is recalculated whenever underlying transactions change

Category income intentionally bypassing RTA must **not** be counted as
dashboard Income (a prior design decision).

------------------------------------------------------------------------

# Activity Calculation

Activity comes exclusively from transactions.

Rules:

-   category transfers affect activity
-   account transfers do not
-   uncategorised transactions never silently disappear
-   split transactions contribute line-by-line

------------------------------------------------------------------------

# Month Rollover

Each month begins from the previous month's closing availability.

Previous bugs around mortgage rollover established an important
invariant:

Carry-forward must preserve available balances exactly.

------------------------------------------------------------------------

# Register Relationship

Registers are the ledger.

Budgets are projections over ledger data.

The register is the authoritative financial history.

------------------------------------------------------------------------

# Scheduled Transactions

Generation rules:

-   deterministic
-   idempotent
-   no duplicate materialisation
-   preserve category IDs
-   preserve transfer relationships
-   preserve split fidelity

Recent fixes introduced:

-   gateway generation guards
-   category ID fidelity
-   duplicate protection

Future enhancements:

-   weekend handling
-   end-after-occurrence support
-   richer recurrence rules

------------------------------------------------------------------------

# Overspending

Future UX improvements are pinned:

-   clearer colours
-   warnings
-   overbudget indicators
-   recovery guidance

Engine behaviour remains separate from presentation.

------------------------------------------------------------------------

# Credit Cards

Credit card payment categories remain engine-managed.

Users budget toward payment categories rather than directly reducing
debt.

Future debt planning may extend this subsystem.

------------------------------------------------------------------------

# Recalculation Philosophy

Whenever data changes:

1.  registers recalculate
2.  category activity recalculates
3.  month availability recalculates
4.  dashboard recalculates
5.  reports recalculate

No cached financial state should become authoritative.

------------------------------------------------------------------------

# Import Integration

Importers populate canonical entities only.

Importer quirks should never become permanent engine rules.

------------------------------------------------------------------------

# Testing Expectations

Every engine change requires:

-   regression tests
-   importer regression where applicable
-   build verification
-   financial correctness review

Correctness is always prioritised over optimisation.

------------------------------------------------------------------------

# Future Roadmap

Planned engine work:

-   financial goals
-   target scheduling
-   forecasting
-   debt payoff planning
-   investment tracking
-   multi-currency
-   forecasting scenarios

These extend the engine without compromising determinism.

End of Part 10.
