# v1.52 Transaction Import Foundation

## Purpose

v1.52 introduces register-scoped CSV transaction import.

This is separate from budget backup/restore:

```text
Budget Backup / Restore = JSON, complete budget structure
Transaction Import = CSV, bank-style transaction intake
```

## UX Direction

Import is launched from an account register, so the target account is implicit.

```text
Open Register
↓
Import
↓
Choose CSV
↓
Preview / Match
↓
Import selected new transactions
```

The import dialog shows the target account as read-only context rather than asking the user to select an account again.

## Matching Rules

v1.52 avoids naive 1:1 duplicate checks.

Rows are classified against transactions in the current register only:

- `exact-match`: same date, amount, and payee, or same amount within 3 days.
- `possible-match`: same amount within 7 days.
- `new`: no matching transaction found.
- `invalid`: missing date, payee, or amount.

Only `new` rows are selected for import by default.

This handles the common manual-entry case where a user enters a transaction on purchase date and the bank file settles it a few days later.

## Supported CSV Columns

The parser recognises common headings:

```text
Date / Transaction Date / Posted Date / Settled Date
Payee / Description / Merchant / Name
Amount / Value
Outflow / Debit / Withdrawal / Spent
Inflow / Credit / Deposit / Received
Memo / Notes / Details / Reference
```

## Out of Scope

- QIF / OFX / QFX parsing.
- Bank-specific import profiles.
- Payee cleanup rules.
- Auto-categorisation.
- Import rollback / undo.
- Cross-account matching.
- CSV export review.

## Pinned Follow-ups

- Add CSV export for conventional user-facing exports.
- Add category ghost text/autocomplete.
- Add richer possible-match review actions.
- Add OFX/QFX/QIF import formats.
- Consider payee rules and auto-categorisation after CSV import is stable.
