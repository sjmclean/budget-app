# PROJECT HANDOVER MASTER --- PART 7

# Reporting, Dashboard, Planning & Cloud Architecture

# 1. Reporting Philosophy

Reports should explain the financial state of the budget, not simply
present raw numbers. Every figure should be traceable back to accounts,
categories and transactions.

Guiding principles:

-   Accuracy before aesthetics.
-   Interactive drill-down wherever practical.
-   Reports are derived data and never become the source of truth.

------------------------------------------------------------------------

# 2. Dashboard

The dashboard is the landing page for an opened budget.

Current goals:

-   Financial snapshot
-   Ready To Assign
-   Income and Expense summaries
-   Net Worth
-   Recent activity

Historical decisions:

-   Net worth chart is valuable and should remain.
-   Automatic backups should not generate dashboard warnings.
-   Income should exclude direct category income that bypasses Ready To
    Assign.

Future ideas:

-   Upcoming scheduled transactions
-   Budget health indicators
-   Goal progress
-   Cashflow forecast
-   Spending trends

------------------------------------------------------------------------

# 3. Reporting Engine

Current / Planned reports:

-   Income vs Expense
-   Net Worth
-   Category Spending
-   Payee Spending
-   Account Balances
-   Budget Activity
-   Cashflow
-   Reconciliation history

Future enhancements:

-   Custom report builder
-   Saved report layouts
-   Export to CSV/PDF
-   Interactive filtering
-   Comparative month views

------------------------------------------------------------------------

# 4. Planning & Goals Engine

The Planning Engine is intentionally separate from budgeting.

Purpose:

-   Forecast future months
-   Model scenarios
-   Savings goals
-   Debt payoff plans
-   Income planning
-   What-if analysis

The planning model must never silently alter actual budget data.

------------------------------------------------------------------------

# 5. Portable Budget Package

Core philosophy:

The portable package is the authoritative representation of a budget.

Cloud providers are transport mechanisms only.

A package should ultimately encapsulate:

-   Budget data
-   Attachments
-   Metadata
-   Sync information
-   Version information
-   Recovery information

------------------------------------------------------------------------

# 6. Cloud Synchronisation

Planned providers:

-   Dropbox
-   iCloud Drive
-   Google Drive

Design principles:

-   Offline-first
-   Explicit conflict handling
-   Automatic recovery
-   Deterministic synchronisation
-   Provider independence

Future work:

-   File locking
-   Conflict detection
-   Merge strategy
-   Sync diagnostics

------------------------------------------------------------------------

# 7. Multi-device Vision

Users should be able to:

-   Budget on desktop
-   Enter purchases on mobile
-   Sync safely
-   Recover from interruptions

Concurrency should be handled at the package layer rather than relying
on cloud provider behaviour.

------------------------------------------------------------------------

# 8. Performance Philosophy

The application should remain responsive with:

-   Many years of history
-   Large attachment collections
-   Thousands of scheduled transactions
-   Large transaction registers

Optimisation should never compromise financial correctness.

------------------------------------------------------------------------

# 9. ADR Candidates

ADR-034 Reports are derived data.

ADR-035 Dashboard is informational, not authoritative.

ADR-036 Planning is isolated from budgeting.

ADR-037 Portable package is the source of truth.

ADR-038 Cloud providers are transport only.

ADR-039 Offline-first architecture.

End of Part 7.
