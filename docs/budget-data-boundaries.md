# Budget Data Boundaries

This document defines the data ownership boundary introduced by v1.48 Budget Isolation Completion.

The rule is simple:

```text
Switching budgets must feel like opening a different budget file.
```

Only global application preferences should survive a budget switch.

---

## Global App Data

Global data belongs to the installed/running app, not to any individual budget.

Examples:

```text
Theme
Language
Date format
Number format
First day of week
Selected budget id
Budget registry / recent budget list
Persistence mode display information
Cloud provider configuration shell
```

Global data may be shared across budgets because it describes the app experience rather than budget content.

---

## Budget-Scoped Data

Budget-scoped data belongs to one budget only.

Examples:

```text
Accounts
Account registers
Transactions
Transaction splits
Transaction attachment metadata
Payees
Scheduled transactions
Budget month views
Category groups
Categories
Assigned amounts
Category archive/hidden/merge state
Budget activity calculations
Budget-level settings such as name, currency, decimal places, and future month limit
```

A screen, repository, adapter, or calculation must not read budget-scoped data without knowing which budget is active or which budget id was explicitly requested.

---

## Browser localStorage Boundary

Before v1.48, several browser localStorage services used global keys such as:

```text
budget-app.accounts.v1
budget-app.account-registers.v1
budget-app.payees.v1
budget-app.scheduled-transactions.v1
```

v1.48 introduces a budget-scoped storage wrapper. New browser writes for those domains are stored as:

```text
budget-app.budgets.<budgetId>.<original-key>
```

For example:

```text
budget-app.budgets.household.budget-app.accounts.v1
budget-app.budgets.side-business.budget-app.payees.v1
```

The legacy global keys remain readable only as a migration bridge for the original starter budget. New writes go to the active budget namespace.

---

## SQLite / Host Boundary

SQLite-backed adapters should follow the same rule at the schema/query layer:

```text
Every budget-owned table should either carry budgetId directly or be reachable only through a budget-owned parent.
```

Examples:

```text
accounts.budgetId
payees.budgetId
scheduled_transactions.budgetId
category_groups.budgetId
categories.budgetId
transactions -> accountId -> accounts.budgetId
attachments -> transactionId -> transactions -> accounts.budgetId
```

Queries must filter by budget id directly or through a verified budget-owned parent. Future host APIs should reject cross-budget access rather than relying only on UI filtering.

---

## Future Reset/Delete Boundary

Reset Budget should clear only the active budget's scoped data and then recreate starter template categories for that same budget.

Delete Budget should remove:

```text
Registry entry
Budget-scoped browser storage keys
SQLite rows owned by that budget
Future package file references for that budget
```

Delete Budget should not remove global app preferences.

---

## Export / Backup / Restore Boundary

Export and backup must operate on a single selected budget unless the user explicitly chooses an app-level backup.

A budget export should include:

```text
Budget registry summary for that budget
Budget settings
Accounts
Payees
Categories
Transactions
Scheduled transactions
Attachment metadata
Budget month data
```

It should not include unrelated budgets.

---

## Open Follow-Up Items

The Settings foundation still stores general and budget settings together. A future settings release should split this into:

```text
Global app preferences
Budget profile/preferences
```

That split should happen before relying on Settings data for export, reset, delete, or package-file persistence.
