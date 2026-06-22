# v1.53 Import Column Mapping

## Purpose

Bank CSV exports are not standardised. Different banks use different headers, date formats, amount conventions, and description fields. v1.53 adds a mapping layer before import preview so the user can tell the app what each CSV column means.

## Register-Launched Import

Import remains launched from the account register. The target account is therefore implicit and the import flow should not ask the user to select an account again.

The broader question of whether import and matching should remain entirely register-centred is still pinned for later UX review.

## Supported Column Roles

- Date
- Payee / Description
- Payee fallback
- Memo
- Amount (+/-)
- Outflow / Debit
- Inflow / Credit
- Balance
- Ignore

## Payee Fallback

Some bank files have a merchant/payee column for normal purchases but leave that column blank for transfers or account payments. In those files another column, often `Transaction Details`, still contains useful text.

Recommended mapping for those files:

- Merchant Name -> Payee / Description
- Transaction Details -> Memo

If the primary payee is blank, the importer uses an explicitly mapped Payee fallback column. If no explicit Payee fallback is mapped, the importer uses Memo as the final fallback.

This allows normal purchases to keep a clean merchant payee while transfer-like rows still import as valid inflow/outflow rows.

## Amount (+/-)

Use Amount (+/-) only when the bank has one amount column where spending and deposits are represented by sign.

Examples:

- `-12.50` becomes an outflow of `12.50`
- `500.00` becomes an inflow of `500.00`

If the bank provides separate debit and credit columns, map them to Outflow / Debit and Inflow / Credit instead.

## Date Parsing

Supported date formats include:

- `YYYY-MM-DD`
- `DD/MM/YYYY`
- `DD-MM-YYYY`
- `DD.MM.YYYY`
- `YYYYMMDD`
- `DDMMYYYY`
- `22 Jun 2026`
- `22 Jun 26`
- `Jun 22 2026`
- Dates with trailing time text

## Current Limitations

This release does not implement full transfer detection. Transfer-like bank rows are imported as ordinary inflow/outflow rows for now. Transfer detection and transfer matching remain pinned for future import/matching review.

## Verification

Run:

```bash
pnpm test:v153
pnpm --filter @budget-app/web build
git status
```
