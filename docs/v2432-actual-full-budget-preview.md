# v2.43.2 Actual Budget Full-Budget Preview

This release expands the Actual Budget provider from count-only inspection into a structured full-budget preview.

## Scope

Actual Budget remains a full-budget migration source, similar to YNAB4. It is not routed through the account-level CSV/QIF transaction import dialog.

The preview now exposes:

- accounts
- category groups
- categories
- payees
- transactions
- resolved account/category/payee names on transactions
- transfer count
- reference warnings for missing accounts, categories and payees

## Still deferred

Commit remains disabled.

The next release should map this preview into the budget creation / full-budget import commit path rather than the open-account bank-import path.
