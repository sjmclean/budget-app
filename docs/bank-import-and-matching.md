# Bank Import and Matching

v1.2.13 introduced banking import foundations and v1.2.14 added commit/undo workflows.

## Supported import foundations

- CSV
- QIF
- OFX
- QFX

The current backend supports parsing and candidate matching, but the final user experience should include an import review screen before committing transactions.

## Matching goals

The matching engine should prevent duplicates by comparing:

- Date and amount.
- Account.
- Payee/description.
- Bank-provided IDs such as FITID when available.
- Existing imported fingerprints.

## Payee rules

Payee rules support auto-cleanup and auto-categorisation. v1.2.14 added persistence and conflict detection.

Typical rule examples:

```text
Description contains "WOOLWORTHS" → Payee: Woolworths → Category: Groceries
Description contains "NETFLIX" → Payee: Netflix → Category: Subscriptions
```

## Future UI workflow

A complete bank import wizard should show:

1. Select account.
2. Choose file.
3. Select saved CSV mapping if needed.
4. Preview parsed rows.
5. Show matched existing transactions.
6. Show new transactions.
7. Allow edits before commit.
8. Commit batch.
9. Allow undo batch.

## Known real-world risks

OFX/QFX files differ between banks. Expect edge cases around date formats, encoding, signs, credit-card conventions, duplicate FITIDs, and investment account sections.
