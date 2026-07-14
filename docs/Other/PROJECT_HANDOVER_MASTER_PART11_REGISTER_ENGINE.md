# PROJECT HANDOVER MASTER --- PART 11

# Register Engine Technical Specification

## Purpose

The Register Engine is the canonical ledger for every account. It is the
authoritative record of financial history. Budget calculations, reports
and dashboards derive from register data.

------------------------------------------------------------------------

# Design Principles

-   Ledger first
-   Deterministic behaviour
-   No hidden mutations
-   Full auditability
-   Fast editing with financial correctness

------------------------------------------------------------------------

# Canonical Transaction Model

A transaction contains:

-   immutable ID
-   account
-   date
-   payee
-   category
-   transfer account (optional)
-   inflow/outflow
-   memo
-   cleared/reconciled state
-   tags
-   split lines
-   future attachments

Transactions should never depend on importer-specific fields.

------------------------------------------------------------------------

# Transaction Lifecycle

1.  Create
2.  Validate
3.  Insert
4.  Recalculate register balances
5.  Recalculate budget activity
6.  Refresh dashboard and reports

Deletion follows the same pipeline in reverse.

------------------------------------------------------------------------

# Editing

Editing should preserve IDs whenever possible.

Changing category, amount or date must trigger downstream recalculation.

Edits should be transactional---either all changes succeed or none do.

------------------------------------------------------------------------

# Split Transactions

Splits are first-class records.

Rules:

-   parent owns date/payee/account
-   each split owns its category and amount
-   split totals must equal parent total
-   budget activity is calculated from split lines

------------------------------------------------------------------------

# Transfers

Transfers create linked financial movement between accounts.

Invariants:

-   no category on normal transfers
-   balances remain symmetrical
-   editing one side updates the linked transaction
-   off-budget transfers may be categorised where appropriate

------------------------------------------------------------------------

# Running Balances

Running balances are derived.

They should always be recalculated from chronological transaction order
rather than incrementally patched.

------------------------------------------------------------------------

# Reconciliation

States:

-   Uncleared
-   Cleared
-   Reconciled

Reconciliation changes presentation and reporting but must not alter the
underlying transaction values.

------------------------------------------------------------------------

# Validation Rules

Prevent:

-   invalid dates
-   impossible split totals
-   orphan transfer links
-   invalid categories
-   missing required accounts

Validation belongs in the engine, not only the UI.

------------------------------------------------------------------------

# Tags

Current behaviour:

-   lightweight labels

Pinned improvements:

-   quick-create from picker
-   tag management UI
-   colours
-   filtering
-   reporting

Tags should remain optional metadata and not drive financial logic.

------------------------------------------------------------------------

# Attachments (Future)

Transactions may own receipts and documents.

Metadata belongs to the transaction. Binary storage should remain
external to core calculations.

------------------------------------------------------------------------

# Selection & Bulk Operations

Bulk actions should support:

-   categorise
-   assign payee
-   add/remove tags
-   move
-   delete
-   reconcile

Desktop context menu support is pinned as an additional shortcut, not a
replacement for visible controls.

------------------------------------------------------------------------

# Import Pipeline

Imported transactions must pass through the same validation pipeline as
manual entries.

No importer receives privileged behaviour.

------------------------------------------------------------------------

# Performance

Optimise for:

-   large ledgers
-   virtualised rendering
-   lazy loading
-   deterministic recalculation
-   efficient filtering

Correctness always outweighs micro-optimisations.

------------------------------------------------------------------------

# Future Roadmap

Planned work:

-   receipt OCR
-   attachment previews
-   undo/redo history
-   transaction version history
-   advanced search
-   saved filters
-   desktop context menu
-   richer keyboard shortcuts

End of Part 11.
