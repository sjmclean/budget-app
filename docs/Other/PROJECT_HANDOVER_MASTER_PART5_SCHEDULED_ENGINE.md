# PROJECT HANDOVER MASTER --- PART 5

# Scheduled Transaction Engine Technical Specification

## 1. Purpose

The Scheduled Transaction Engine automates the creation of future
register transactions while preserving the same financial integrity as
manually entered transactions.

A scheduled transaction is a template. It is **not** a transaction until
it has been materialised into the register.

------------------------------------------------------------------------

# 2. Core Design Philosophy

The scheduler should be:

-   Deterministic
-   Idempotent
-   Explainable
-   Recoverable

Users must be able to trust that:

-   no occurrences are missed
-   no occurrence is generated twice
-   historical occurrences never change unexpectedly

------------------------------------------------------------------------

# 3. Data Model

Conceptually a schedule contains:

-   Account
-   Payee
-   Category / Split Categories
-   Memo
-   Amount
-   Recurrence Rule
-   Next Due Date
-   Weekend Policy (future)
-   End Conditions (future)

Generated register transactions should retain a reference back to the
originating scheduled transaction.

------------------------------------------------------------------------

# 4. Materialisation

Materialisation is the process of converting a schedule into one or more
register transactions.

The generated transaction should behave exactly like a manually entered
transaction once created.

No special budgeting logic should exist for scheduled occurrences after
they have been materialised.

------------------------------------------------------------------------

# 5. Generation Algorithm

High-level flow:

Read active schedules ↓ Determine due occurrences ↓ Validate occurrence
↓ Materialise transaction ↓ Persist via Register Engine ↓ Advance next
due date

The Register Engine performs final persistence validation.

------------------------------------------------------------------------

# 6. Idempotency

This is one of the most important architectural guarantees.

Recent improvements:

v2.94 - Materialisation fidelity - Category ID preservation

v2.94.1 - Persistence-level duplicate protection - Deterministic
occurrence identity - Register-level integrity checks

Generation services should never be the sole protection against
duplicates.

Persistence is the final authority.

------------------------------------------------------------------------

# 7. Historical Integrity

Editing a schedule should affect future occurrences only.

Historical register transactions remain immutable records unless
explicitly edited by the user.

Deleting a schedule must not delete previously generated occurrences.

------------------------------------------------------------------------

# 8. Future Recurrence Model (Pinned)

Current recurrence options should be reviewed.

Desired capabilities include:

-   Daily
-   Weekly
-   Fortnightly
-   Monthly
-   Quarterly
-   Yearly
-   Every X days
-   Every X weeks
-   Every X months
-   Every X years

Future extensibility should be considered when designing recurrence
storage.

------------------------------------------------------------------------

# 9. Weekend Policy (Pinned)

Requested feature inspired by Budget with Buckets.

Policies:

-   Post on scheduled date
-   Friday before
-   Monday after

The adjustment should preserve the original recurrence pattern rather
than causing long-term drift.

------------------------------------------------------------------------

# 10. End Conditions (Pinned)

Support:

-   Never ends
-   End on date
-   End after X occurrences

Occurrence counts should survive application restarts.

------------------------------------------------------------------------

# 11. Planned Enhancements

Future ideas:

-   Skip next occurrence
-   Postpone occurrence
-   Duplicate schedule
-   Pause schedule
-   Resume schedule
-   Preview future occurrences
-   Upcoming calendar view

------------------------------------------------------------------------

# 12. Transfers

Scheduled transfers should materialise as linked transactions while
preserving transfer integrity.

Duplicate prevention applies equally to transfers.

------------------------------------------------------------------------

# 13. Imports

YNAB4 scheduled transactions now preserve category identity.

Future importers should map into the same schedule model rather than
creating import-specific schedule types.

------------------------------------------------------------------------

# 14. Testing Philosophy

Every scheduler change should include:

-   recurrence tests
-   leap year tests
-   month-end tests
-   weekend tests
-   duplicate prevention tests
-   import fidelity tests

Financial correctness is more important than implementation elegance.

------------------------------------------------------------------------

# 15. ADR Candidates

ADR-023 Scheduled transactions are templates.

ADR-024 Materialisation creates ordinary register transactions.

ADR-025 Persistence guarantees idempotency.

ADR-026 Historical occurrences are immutable.

ADR-027 Weekend policy is recurrence metadata.

ADR-028 End conditions belong to schedule metadata.

End of Part 5.
