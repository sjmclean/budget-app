# PROJECT HANDOVER MASTER --- PART 14

# UI/UX Architecture & Design System

## Vision

The application should feel approachable for new budgeters while
remaining efficient for power users. Financial correctness always takes
priority, but the UI should make that correctness easy to understand.

------------------------------------------------------------------------

# Design Principles

-   Clarity over density
-   Progressive disclosure
-   Consistent interactions
-   Desktop-first with responsive support
-   Accessibility by default

------------------------------------------------------------------------

# Dashboard

The dashboard is the landing page for every budget.

Goals:

-   communicate financial health
-   surface actionable information
-   avoid duplicating detailed reports

Project decisions:

-   Net Worth chart is valuable.
-   Automatic backups should not create dashboard alerts.
-   Category income bypassing Ready To Assign is excluded from dashboard
    Income.

------------------------------------------------------------------------

# Budget Screen

Purpose:

-   allocate money
-   review category health
-   navigate months quickly

Pinned UX work:

-   reduce clutter
-   move infrequent actions into management screens
-   explore side-by-side multi-month budgeting
-   improve overspending and overbudget indicators

------------------------------------------------------------------------

# Register

The register is the user's primary workspace.

Design goals:

-   fast entry
-   keyboard friendly
-   high information density
-   clear reconciliation state

Pinned improvements:

-   desktop context menu
-   richer keyboard shortcuts
-   improved bulk editing
-   attachment support

------------------------------------------------------------------------

# Scheduled Transactions

Future editor improvements:

-   richer recurrence builder
-   Friday / Monday weekend handling
-   end after N occurrences
-   advanced recurrence options (every X days/weeks/months/years)

------------------------------------------------------------------------

# Tags

Current state:

-   lightweight labels

Pinned redesign inspired by BFB:

-   clicking the tag field opens a lightweight picker
-   create a new tag directly from the picker
-   manage tags without leaving transaction entry
-   future colours and usage counts
-   improved filtering and reporting

Tag creation should be frictionless.

------------------------------------------------------------------------

# Budget Manager

Historical decisions:

-   remove redundant management cards
-   smaller budget tiles
-   simplify new budget flow
-   remove unnecessary explanatory text
-   close menus when clicking away

------------------------------------------------------------------------

# Transaction Entry

Goals:

-   minimal clicks
-   immediate validation
-   intelligent defaults

Pinned review items:

-   evaluate split button placement
-   consider creating categories directly during entry
-   reduce visual clutter

------------------------------------------------------------------------

# Error Presentation

Errors should:

-   explain the problem
-   explain the fix
-   avoid technical jargon

Future work replaces generic dialogs with custom in-app messaging.

------------------------------------------------------------------------

# Accessibility

Requirements:

-   keyboard navigation
-   visible focus states
-   sufficient contrast
-   scalable typography
-   screen-reader friendly controls

Accessibility is a release requirement, not a post-release enhancement.

------------------------------------------------------------------------

# Design Language

Visual style should be:

-   clean
-   calm
-   professional
-   consistent

Animations should support understanding rather than decoration.

------------------------------------------------------------------------

# UX Roadmap

Pinned items include:

-   Merchant Knowledge UI
-   Tags redesign
-   Scheduled transaction editor
-   Multi-month budgeting
-   Better overspending visuals
-   Dashboard refinement
-   Report navigation
-   Mobile optimisation
-   Attachment workflows
-   Context menus
-   Improved onboarding

The UI should continue evolving while preserving familiarity for
existing users.

End of Part 14.
