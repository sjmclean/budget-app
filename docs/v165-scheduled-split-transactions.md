# v1.65 Scheduled Split Transactions

## Purpose

v1.65 adds a first-class representation for scheduled split transactions.

This exists primarily because YNAB4 scheduled transactions can contain `subTransactions`. Without a dedicated model, those scheduled split lines would have to be flattened, ignored, or imported with lost category/memo detail.

## What Changed

Added:

- `ScheduledTransactionSplitLine` type
- `scheduled_transaction_split_lines` SQLite table
- `ScheduledTransactionSplitLineRepository`
- `SqliteScheduledTransactionSplitLineRepository`
- `createScheduledSplitTransaction` budget-engine service
- v1.65 tests

## Model

A scheduled split transaction is represented as:

```text
ScheduledTransaction
  type = Split
  categoryId = null
  amount = total amount

ScheduledTransactionSplitLine[]
  scheduledTransactionId
  categoryId
  memo
  amount
  sortOrder
```

The split line amounts must sum to the scheduled transaction amount.

## YNAB4 Import Relevance

YNAB4 scheduled `subTransactions` can now map to `ScheduledTransactionSplitLine` records instead of being lost.

This removes the core representation blocker for scheduled split transactions.

## Still Not Done

This patch does not implement YNAB4 import writes.

Still required before full YNAB4 scheduled import:

- map YNAB4 scheduled `subTransactions` into this model
- map YNAB4 recurrence details such as twice-a-month metadata
- decide how scheduled split transactions appear in the future scheduled transaction UX
- test against real YNAB4 scheduled split examples

## Test Command

```bash
pnpm test:v165
```

## Build Verification

```bash
pnpm --filter @budget-app/web build
```
