# PROJECT HANDOVER MASTER --- PART 6

# Transaction Intake, Import Framework & Merchant Knowledge

# 1. Purpose

The import pipeline exists to migrate data into the application's
internal domain model without allowing external budgeting applications
to influence the core architecture.

The objective is migration fidelity, not behavioural compatibility.

------------------------------------------------------------------------

# 2. Import Architecture

Import flow:

Source File → Parser → Import Adapter → Internal Canonical Model →
Validation → Register / Budget Services → Persistence

Each importer is responsible only for translation.

------------------------------------------------------------------------

# 3. Supported Sources

Current / Planned:

-   YNAB4
-   Actual Budget
-   CSV
-   QIF

Future adapters should implement the same interface.

------------------------------------------------------------------------

# 4. Canonical Domain Model

All imported objects should become native application objects.

Examples:

-   Accounts
-   Categories
-   Payees
-   Scheduled Transactions
-   Transactions
-   Budgets
-   Tags

No importer-specific object types should remain after import completes.

------------------------------------------------------------------------

# 5. Transaction Intake

Transaction Intake is intentionally separated from importing.

Its responsibilities include:

-   Duplicate detection
-   Candidate matching
-   Merchant normalisation
-   Review workflow
-   User confirmation
-   Safe materialisation

The review process should explain *why* a recommendation was made.

------------------------------------------------------------------------

# 6. Matching Philosophy

Prefer conservative matching over aggressive automation.

False positives are considered more harmful than requiring user review.

The user should always understand the evidence behind a suggested match.

------------------------------------------------------------------------

# 7. Merchant Knowledge (Pinned Subsystem)

Merchant Knowledge is planned as a dedicated subsystem rather than being
embedded inside importers.

Responsibilities:

-   Merchant aliases
-   Canonical merchant names
-   Default categories
-   Preferred tags
-   Import rules
-   Usage statistics
-   Historical learning
-   Manual overrides

This subsystem should remain transparent and fully user-editable.

------------------------------------------------------------------------

# 8. Migration Strategy

Where practical, migration should preserve:

-   aliases
-   rename rules
-   default categories
-   recurring merchant behaviour

Examples include YNAB4 and Actual Budget migrations.

------------------------------------------------------------------------

# 9. UX Principles

The review screen should build trust.

Recommended improvements:

-   clearer confidence indicators
-   evidence panel
-   easier categorisation
-   prominent uncategorised warnings
-   fast keyboard workflow

------------------------------------------------------------------------

# 10. Future Opportunities

Potential future enhancements:

-   Batch review
-   Rule suggestions
-   Merchant merge tool
-   Import simulation mode
-   AI-assisted suggestions (always user-confirmed)

Automation must never remove user control.

------------------------------------------------------------------------

# 11. ADR Candidates

ADR-029 Importers translate into the canonical model.

ADR-030 Merchant Knowledge is importer-independent.

ADR-031 Conservative matching is preferred.

ADR-032 User confirmation remains central to intake.

ADR-033 Imported data should be explainable.

End of Part 6.
