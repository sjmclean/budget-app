# v1.47 Active Budget Context + Dialog Foundation

## Purpose

v1.47 starts converting the web app from a hardcoded demo budget workflow into an active-budget workflow.

The budget registry introduced in v1.46 now has a small active budget resolver and the selected budget id is persisted so a page refresh can continue in the same budget.

## Changes

- Added active budget resolver helpers.
- Persisted the selected budget id in localStorage.
- AppShell resolves and normalises the active budget before rendering workspace routes.
- BudgetPage now uses the active budget id instead of hardcoding `household`.
- AccountRegisterPage loads category options for the active budget id instead of hardcoding `household`.
- Dashboard and TopBar display the active budget name.
- Added an app dialog service as a first standardisation step away from direct `alert()` / `confirm()` usage.
- Replaced current direct app UI `alert()` / `confirm()` calls with the dialog service.
- Added v1.47 release validation.

## Still intentionally out of scope

- True budget-scoped localStorage isolation for accounts, payees, register transactions, scheduled transactions, and attachments.
- Reset Budget and Delete Budget lifecycle workflows.
- Desktop host budget file selection.
- Custom modal rendering for dialogs.

Those belong in the next architecture consolidation releases.
