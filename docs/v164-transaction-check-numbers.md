# v1.64 Transaction Check Numbers

## Purpose

YNAB4 transactions can contain `checkNumber` values. The v1.62 completeness audit identified this as a data-loss risk because the app could track account-level last-entered check number settings, but individual transactions had no first-class check-number field.

v1.64 adds a first-class optional transaction check number so YNAB4 cheque/check-number data has a safe landing place before actual YNAB4 import writes begin.

## What Changed

- Added optional `checkNumber` to the core `Transaction` type.
- Added `check_number` to the SQLite `transactions` table.
- Updated SQLite transaction repository create/update/read paths.
- Added `checkNumber` to browser register transaction models.
- Added check-number entry/edit fields in the register UI.
- Added a visible `Check #` register column.
- Updated the YNAB4 completeness audit to mark transaction check numbers as representable.

## Import Behaviour

Future YNAB4 import should map:

```text
YNAB4 transaction.checkNumber
→ transaction.checkNumber
```

The value is trimmed. Blank values are stored as `null`/omitted.

## Scope

This release does not perform YNAB4 import writes.

It only adds the missing representation layer required to preserve check numbers when import writes are added later.

## Remaining YNAB4 Import Blockers

After v1.64, the main remaining representation/mapping blockers include:

- scheduled split transactions
- historical monthly budget/category-month mapping
- transfer-pair mapping validation
- credit-card migration validation
- reconciliation metadata validation
- YNAB4 source-id traceability

## Test Command

```bash
pnpm test:v164
```

## Build Verification

```bash
pnpm --filter @budget-app/web build
```
