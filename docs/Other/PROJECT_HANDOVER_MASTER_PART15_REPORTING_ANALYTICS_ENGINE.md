# PROJECT HANDOVER MASTER --- PART 15

# Reporting & Analytics Engine

## Purpose

The Reporting Engine transforms canonical budget data into meaningful
insights. Reports never own financial state---they derive it from the
Budget and Register engines.

------------------------------------------------------------------------

# Design Principles

-   Read-only over canonical data
-   Deterministic results
-   Historical accuracy
-   Consistent calculations across reports
-   Fast enough for multi-year budgets

------------------------------------------------------------------------

# Reporting Pipeline

1.  Read canonical entities
2.  Aggregate data
3.  Apply filters
4.  Calculate metrics
5.  Render charts/tables
6.  Export (future)

No report should mutate the budget.

------------------------------------------------------------------------

# Dashboard

The dashboard is the highest-level report.

Current decisions include:

-   Dashboard is the landing page.
-   Net Worth chart is a core feature.
-   Automatic backups should not generate dashboard warnings.
-   Category income that bypasses Ready To Assign is excluded from
    dashboard "Income".

------------------------------------------------------------------------

# Core Reports

Current and planned reports include:

-   Income vs Expense
-   Spending by Category
-   Spending by Payee
-   Budget vs Actual
-   Cash Flow
-   Net Worth
-   Account Balances
-   Category History

Future reports should reuse common aggregation services.

------------------------------------------------------------------------

# Net Worth

Net Worth is calculated from account balances over time.

Requirements:

-   deterministic history
-   support account closures
-   include on/off-budget rules where appropriate
-   allow future trend analysis

------------------------------------------------------------------------

# Filters

Every report should support consistent filtering:

-   date range
-   account
-   category
-   payee
-   tag
-   cleared status
-   reconciled status

Future filters should be implemented centrally.

------------------------------------------------------------------------

# Charts

Charts should emphasise clarity.

Guidelines:

-   avoid unnecessary decoration
-   maintain consistent colour meaning
-   support keyboard and screen readers
-   remain readable when printed

------------------------------------------------------------------------

# Forecasting

Future forecasting should use:

-   scheduled transactions
-   recurring income
-   targets
-   debt plans

Forecasts must remain separate from historical reports.

------------------------------------------------------------------------

# Export

Future export formats:

-   CSV
-   PDF
-   Excel
-   printable reports

Exports should match on-screen calculations exactly.

------------------------------------------------------------------------

# Performance

Large budgets should remain responsive.

Strategies include:

-   incremental aggregation
-   caching derived report data
-   lazy loading
-   virtualised tables where needed

Caching must never become the source of truth.

------------------------------------------------------------------------

# Testing

Regression tests should verify:

-   aggregation correctness
-   date filtering
-   transfer handling
-   split handling
-   net worth calculations
-   dashboard metrics
-   report consistency

Every reporting bug should become a permanent regression test.

------------------------------------------------------------------------

# Roadmap

Pinned reporting enhancements:

-   forecasting dashboard
-   savings goal progress
-   debt payoff analytics
-   investment reporting
-   cash-flow projections
-   tag-based reporting
-   attachment-aware reports
-   report favourites
-   custom dashboards

The Reporting Engine should remain modular so new reports reuse existing
calculation services rather than duplicating business logic.

End of Part 15.
