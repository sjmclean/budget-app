# PROJECT HANDOVER MASTER --- PART 13

# Transaction Intake & Import Engine

## Purpose

The Intake Engine imports external data into the canonical budget model
while preserving fidelity, correctness, and user trust. Every importer
ultimately produces the same internal entities regardless of source.

------------------------------------------------------------------------

# Supported Sources

Current:

-   CSV
-   QIF
-   YNAB4 Launcher exports
-   Actual Budget (planned/partial)

Future:

-   OFX
-   QFX
-   Direct bank feeds
-   Open Banking connectors

------------------------------------------------------------------------

# Intake Pipeline

1.  Parse source data
2.  Validate records
3.  Canonicalise fields
4.  Detect transfers
5.  Match existing transactions
6.  Present review UI
7.  Commit accepted records
8.  Recalculate budget engine

The commit stage is the only point where ledger data changes.

------------------------------------------------------------------------

# Canonicalisation

Normalise before matching:

-   dates
-   amounts
-   payees
-   category references
-   account mappings
-   currencies
-   memo formatting

Importer-specific quirks must end here.

------------------------------------------------------------------------

# Transaction Matching

Matching uses multiple signals including:

-   amount
-   date proximity
-   account
-   payee similarity
-   transfer detection

A conservative approach is preferred over incorrect automatic matches.

------------------------------------------------------------------------

# Matching Window

Project decision:

Default matching window is **7 days**.

Long lookback windows produced confusing messages (e.g. thousands of
days away) and reduced user confidence.

------------------------------------------------------------------------

# Review Workflow

The review screen should make every decision understandable.

Goals:

-   explain why a match was suggested
-   make acceptance/rejection easy
-   surface uncertainty clearly
-   minimise accidental merges

This workflow is a pinned UX review item.

------------------------------------------------------------------------

# Merchant Knowledge (Pinned)

Long-term subsystem responsibilities:

-   aliases
-   renamed merchants
-   default categories
-   import rules
-   confidence improvements
-   usage statistics
-   transparent user editing

Knowledge must be importer-independent.

------------------------------------------------------------------------

# Migration Principles

Imports should preserve where possible:

-   payees
-   categories
-   category IDs
-   merchant aliases
-   scheduled transactions
-   split transactions
-   transfer relationships

Best-effort preservation is preferred over silent data loss.

------------------------------------------------------------------------

# Uncategorised Transactions

Project decisions:

-   use the term "Uncategorised"
-   highlight clearly in the register
-   display warning near the Category column
-   make unresolved items highly visible

Never silently hide uncategorised imports.

------------------------------------------------------------------------

# Duplicate Protection

The importer should avoid:

-   duplicate imports
-   accidental transfer duplication
-   repeated scheduled materialisation
-   incorrect merge suggestions

When uncertain, require user review.

------------------------------------------------------------------------

# Error Handling

Errors should be:

-   actionable
-   human-readable
-   non-technical where possible

Pinned roadmap:

Replace generic errors with custom in-app messaging.

------------------------------------------------------------------------

# Testing Strategy

Regression coverage should include:

-   parsing
-   canonicalisation
-   matching
-   transfer detection
-   split imports
-   scheduled imports
-   merchant alias handling
-   YNAB4 regressions

Every importer bug should become a permanent regression test.

------------------------------------------------------------------------

# Future Roadmap

Planned work:

-   Merchant Knowledge engine
-   learning suggestions
-   bank feed connectors
-   import history
-   rollback support
-   richer confidence scoring
-   automatic categorisation
-   migration assistants

The Intake Engine should remain deterministic, transparent and
user-controlled.

End of Part 13.
