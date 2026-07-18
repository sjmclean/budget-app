# v3.23.0 — Immutable Budget Identity and Complete Deletion

Newly created and imported budgets now receive UUID-backed immutable identities rather than IDs derived from their display names. Two budgets may have identical names without sharing an identity, and recreating a deleted budget cannot reactivate its former storage namespace.

Deleting a budget now removes the entire `budget-app.budgets.<budgetId>.` namespace, including importer fingerprints, transaction identities, Merchant Knowledge, resumable import sessions, diagnostics, audit/version-history records, and future budget-scoped records. It also removes legacy budget views, YNAB4/Actual import records, budget UI preferences, and account-specific register layout/sort state.

The registry entry and selected-budget pointer are removed only after the budget records are collected for deletion. Unrelated application settings and other budgets remain untouched.
