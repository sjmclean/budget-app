# PROJECT HANDOVER MASTER --- PART 4

# Register Engine Technical Specification

## Purpose

The Register Engine is the authoritative ledger for all financial
activity. Every transaction, edit, split, reconciliation, import and
scheduled occurrence ultimately results in register state.

The register is intentionally designed as the source of truth for
transaction history, while budget calculations derive their activity
from it.

------------------------------------------------------------------------

# Core Responsibilities

-   Store transactions
-   Edit transactions
-   Delete/archive transactions where appropriate
-   Split transactions
-   Running balances
-   Reconciliation
-   Bulk operations
-   Transaction selection
-   Tags
-   Attachments (future)
-   Validation

------------------------------------------------------------------------

# Architectural Principles

## Persistence Authority

A key architectural decision is that the Register owns persistence
integrity.

Examples:

-   Duplicate scheduled transaction protection occurs at persistence.
-   Validation is performed before commit.
-   Services should not assume prior checks are sufficient.

This minimizes race conditions and improves long-term correctness.

------------------------------------------------------------------------

## Transaction Lifecycle

Normal lifecycle:

Draft → Validation → Persistence → Register recalculation → Budget
activity recalculation → Reports updated

The UI should orchestrate this flow rather than implement it.

------------------------------------------------------------------------

# Running Balances

Running balances should always be derived from transaction order.

Requirements:

-   Deterministic ordering
-   Stable sorting
-   Correct recalculation after edits
-   Correct recalculation after imports

------------------------------------------------------------------------

# Split Transactions

Design goals:

-   Unlimited split lines
-   Independent category allocation
-   Individual memos
-   Independent inflow/outflow values

Future enhancements:

-   Split templates
-   Easier editing UX
-   Keyboard-first workflow

------------------------------------------------------------------------

# Tags

Tags replace the legacy flag model.

Future improvements:

-   Inline tag picker
-   Search
-   Multi-select
-   Create tag in-place
-   Manage Tags administration

Tags should remain lightweight metadata rather than affect budgeting
logic.

------------------------------------------------------------------------

# Validation

Validation belongs in services rather than React components.

Examples:

-   valid dates
-   balanced values
-   account existence
-   category existence
-   transfer validation

------------------------------------------------------------------------

# Bulk Operations

Supported / Planned

-   Categorise
-   Tag
-   Delete
-   Move
-   Merge
-   Reconcile

Desktop workflows should minimise repetitive actions.

------------------------------------------------------------------------

# Reconciliation

Objectives:

-   Preserve auditability
-   Avoid hidden balance changes
-   Keep reconciliation deterministic

Future work:

-   Improved reconciliation workflow
-   Better discrepancy reporting

------------------------------------------------------------------------

# Attachments

Future subsystem:

Transactions may contain attachments.

Examples:

-   Receipts
-   PDFs
-   Images

Portable budget packages should encapsulate attachment metadata.

------------------------------------------------------------------------

# Undo / Redo

Potential future architecture:

Command-based history rather than UI snapshots.

Advantages:

-   Reliable
-   Cross-feature
-   Easier persistence

------------------------------------------------------------------------

# Import Integration

Imports should produce register transactions using the same validation
and persistence pathways as manually created transactions whenever
practical.

This keeps behaviour consistent.

------------------------------------------------------------------------

# ADR Candidates

ADR-017 Register is transaction authority.

ADR-018 Validation before persistence.

ADR-019 Running balances are derived.

ADR-020 Tags are metadata only.

ADR-021 Persistence owns integrity.

ADR-022 UI never bypasses register services.

End of Part 4.
