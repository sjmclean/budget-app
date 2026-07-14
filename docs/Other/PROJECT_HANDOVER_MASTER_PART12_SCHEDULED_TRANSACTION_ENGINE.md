# PROJECT HANDOVER MASTER --- PART 12

# Scheduled Transaction Engine Specification

## Purpose

The Scheduled Transaction Engine automates recurring financial activity
while preserving financial correctness. Materialising a scheduled
transaction should produce the same result as if the user had manually
entered it.

------------------------------------------------------------------------

# Design Principles

-   Deterministic
-   Idempotent
-   Source-independent
-   Fully testable
-   Safe to execute repeatedly

The engine must never create duplicate transactions for the same
occurrence.

------------------------------------------------------------------------

# Canonical Scheduled Transaction

A scheduled transaction stores:

-   id
-   accountId
-   payee / payeeId
-   category / categoryId
-   transferAccountId (optional)
-   amount
-   split lines
-   recurrence rule
-   nextDueDate
-   memo
-   metadata

Scheduled transactions are templates, not ledger entries.

------------------------------------------------------------------------

# Materialisation Pipeline

1.  Determine due occurrences.
2.  Validate recurrence.
3.  Check duplicate protection.
4.  Generate register transaction(s).
5.  Preserve category and transfer fidelity.
6.  Advance schedule state.
7.  Recalculate affected registers and budgets.

------------------------------------------------------------------------

# Duplicate Prevention

Recent regressions established these requirements:

-   Generation is idempotent.
-   Running generation multiple times must not create duplicate entries.
-   Concurrent generation paths must be guarded.

Gateway generation locks were introduced to prevent duplicate
materialisation.

------------------------------------------------------------------------

# Category Fidelity

Category IDs must survive generation exactly.

This includes:

-   normal categories
-   Ready To Assign handling
-   transfer exceptions
-   split transaction categories

Importers should populate canonical IDs before generation.

------------------------------------------------------------------------

# Split Transactions

Scheduled splits preserve:

-   category IDs
-   amounts
-   memos

Generated register transactions must exactly match the template.

------------------------------------------------------------------------

# Transfer Fidelity

Transfers must preserve:

-   linked account
-   transfer direction
-   category rules
-   running balance integrity

Off-budget transfer rules remain distinct from normal transfers.

------------------------------------------------------------------------

# Recurrence Rules

Current support should remain deterministic.

Pinned roadmap additions include:

-   every X days
-   every X weeks
-   every X months
-   every X years
-   richer yearly options

Existing recurrence logic should be extensible rather than replaced.

------------------------------------------------------------------------

# Weekend Policy (Pinned)

Future scheduling options:

-   Execute on due date
-   Move to previous Friday
-   Move to following Monday

This behaviour should be configurable per scheduled transaction, similar
to Banking for Budget (BFB).

------------------------------------------------------------------------

# End Conditions (Pinned)

Support:

-   never ends
-   end on date
-   end after N occurrences

The occurrence counter should advance only after successful
materialisation.

------------------------------------------------------------------------

# Forecasting

Future planning may consume scheduled transactions without materialising
them.

Forecast calculations must remain separate from the live ledger.

------------------------------------------------------------------------

# Import Behaviour

YNAB4 imports preserve:

-   recurrence
-   category IDs
-   payees
-   transfers
-   split lines

Importer-specific metadata should not leak into the engine.

------------------------------------------------------------------------

# Testing Strategy

Every change requires regression coverage for:

-   duplicate prevention
-   category ID fidelity
-   split fidelity
-   transfer fidelity
-   recurrence correctness
-   idempotency
-   concurrent generation

Recent regressions should remain permanently covered by tests.

------------------------------------------------------------------------

# Future Roadmap

Planned enhancements:

-   reminders
-   notifications
-   forecasting
-   editable generation history
-   skip occurrence
-   postpone occurrence
-   manual regenerate
-   holiday calendars
-   weekend policies
-   occurrence limits
-   advanced recurrence editor

The engine should remain deterministic regardless of feature growth.

End of Part 12.
