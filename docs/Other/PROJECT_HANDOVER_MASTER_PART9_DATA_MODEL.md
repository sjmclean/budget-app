# PROJECT HANDOVER MASTER --- PART 9

# Canonical Data Model & Storage Specification

## Purpose

This document defines the application's canonical domain model.
Importers, reports, UI and future sync engines should all operate on
these entities rather than source-specific formats.

------------------------------------------------------------------------

# Core Aggregate: Budget

A budget package contains:

-   metadata
-   settings
-   accounts
-   account groups
-   categories
-   category groups
-   payees
-   tags
-   transactions
-   scheduled transactions
-   reports
-   attachments (future)
-   audit metadata (future)

The budget package is the sole source of truth.

------------------------------------------------------------------------

# Accounts

Each account has:

-   id
-   name
-   type
-   currency
-   opening balance
-   closed flag
-   on/off budget state

Invariant:

Transactions determine balances. Balances are never edited directly.

------------------------------------------------------------------------

# Categories

Each category contains:

-   id
-   name
-   group
-   budget values
-   activity
-   available balance
-   target (future)
-   archived state

IDs are immutable.

------------------------------------------------------------------------

# Category Groups

Responsible only for presentation and organisation.

Moving categories between groups must not alter historical budgeting.

------------------------------------------------------------------------

# Transactions

Canonical fields include:

-   id
-   accountId
-   payeeId
-   categoryId
-   date
-   inflow
-   outflow
-   memo
-   cleared
-   reconciled
-   transferAccountId
-   splitLines
-   tags
-   attachments (future)

Transactions are immutable historical records except explicit user
edits.

------------------------------------------------------------------------

# Scheduled Transactions

Contain:

-   recurrence rule
-   next due date
-   optional end condition
-   amount
-   category
-   payee
-   transfer information
-   weekend policy (planned)
-   occurrence limit (planned)

Generation must always be idempotent.

------------------------------------------------------------------------

# Payees

Canonical payees are independent from merchant aliases.

Future Merchant Knowledge maps aliases to canonical payees.

------------------------------------------------------------------------

# Tags

Tags are lightweight labels.

Planned improvements:

-   quick-add from picker
-   colour support
-   management UI
-   statistics
-   filtering

No business logic should depend on tags.

------------------------------------------------------------------------

# Reports

Reports consume canonical data only.

Import-specific behaviour must never leak into reporting.

------------------------------------------------------------------------

# Attachments (Future)

Transactions may own:

-   receipts
-   PDFs
-   images
-   documents

Attachment metadata belongs in the budget package.

Binary storage may be external.

------------------------------------------------------------------------

# Import Metadata

Importer metadata should remain isolated.

Canonical entities should not expose importer-specific concepts.

------------------------------------------------------------------------

# Storage Principles

Requirements:

-   portable
-   deterministic
-   versioned
-   recoverable
-   migration friendly

Future sync metadata should not pollute business entities.

------------------------------------------------------------------------

# Domain Invariants

Always preserve:

-   account balance integrity
-   transfer symmetry
-   category identity
-   scheduled transaction idempotency
-   immutable history
-   deterministic recalculation

Financial correctness takes precedence over convenience.

------------------------------------------------------------------------

# Future Expansion

Planned additions include:

-   goals
-   recurring goals
-   debt planning
-   investments
-   multi-currency
-   audit history
-   cloud metadata
-   collaboration

These should extend---not replace---the canonical model.

End of Part 9.
