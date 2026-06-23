# v1.62 YNAB4 Import Completeness Audit

## Purpose

v1.62 answers a different question from v1.59-v1.61.

Earlier work proved that the app can discover and preview a real YNAB4 package. This audit asks whether the current app can faithfully represent the data once import writes begin.

The answer is: **not yet**.

The codebase has a strong foundation, but a full-fidelity YNAB4 migration still has several schema, mapping, and workflow blockers.

## Scope

This audit is intentionally non-destructive.

It does not:

- create budgets
- create accounts
- create categories
- write transactions
- mutate existing data

It does:

- list YNAB4 data areas that must be preserved
- compare them against current app capabilities
- identify migration blockers
- identify likely data-loss risks
- recommend the order of missing foundational work

## Current Strengths

The app already has useful foundations for YNAB4 migration:

- budgets
- accounts
- on/off budget participation
- category groups
- categories
- payees
- transfer payees
- transactions
- split transaction lines
- cleared status
- scheduled transactions
- budget months
- category months
- reconciliations
- transaction flags schema
- transaction notes schema
- account settings
- category settings
- import run/import map tables

This means the project is not starting from zero.

## Critical Findings

### 1. Category group/header notes are not representable yet

YNAB4 can store notes at the category-header/master-category level.

Current app support:

- individual category settings support notes
- category groups do not have notes/settings

Impact:

- YNAB4 category header notes would be lost
- this is a full-fidelity migration blocker

Recommended fix:

- add `CategoryGroupSettings`, or add a note/settings structure for category groups

This is one of the first underlying pieces that should be built.

---

### 2. Transaction check numbers are now representable

The real YNAB4 data contains transactions with `checkNumber`.

Current app support after v1.64:

- account settings can track `lastEnteredCheckNumber`
- transactions have an optional `checkNumber` field
- SQLite stores this as `transactions.check_number`
- the browser register can display and edit check numbers

Impact:

- cheque/check-number data now has a first-class landing place

Remaining work:

- map YNAB4 `checkNumber` into `transaction.checkNumber` during actual import

---

### 3. Scheduled split transactions are now representable, but YNAB4 recurrence mapping remains unproven

YNAB4 scheduled transactions can contain `subTransactions`.

Current app support:

- scheduled transactions exist
- regular split transaction lines exist
- scheduled split transaction lines now exist

Impact:

- scheduled split transaction line data now has a first-class landing place
- YNAB4 recurrence details could still be partially imported or lose detail

Recommended fix:

- map YNAB4 scheduled `subTransactions` into scheduled split lines
- map YNAB4 recurrence metadata such as `twiceAMonthStartDay`

---

### 4. Historical monthly budget data must be proven before transaction import

YNAB4 stores historical monthly budget allocations in `monthlyBudgets` and `monthlySubCategoryBudgets`.

Current app support:

- `budget_months` exists
- `category_months` exists

Risk:

- schema exists, but YNAB4 mapping is not proven

Impact:

- importing transactions without historical category month data would not be a complete YNAB4 migration

Recommended fix:

- build monthly budget mapping tests before transaction import
- verify assigned, activity, available, previous available, and overspending handling semantics

---

### 5. Transfers and credit-card migration remain high-risk

YNAB4 uses transfer relationships such as:

- `targetAccountId`
- `transferTransactionId`
- transfer payees

Credit-card data can also involve:

- liability accounts
- payments/transfers
- Pre-YNAB debt categories
- historical category balances

Current app support:

- transfer transactions exist
- transfer payees exist
- credit-card handling has been designed conceptually

Risk:

- incorrect mapping can duplicate transfers, distort balances, or misrepresent credit-card payments

Recommended fix:

- build transfer-pair tests from real YNAB4 data
- build dedicated credit-card migration tests before full transaction import

## Completeness Matrix

| Area | Status | Risk | Required before full import |
|---|---:|---:|---:|
| Accounts | Partial | Medium | Yes |
| Category groups | Missing | Critical | Yes |
| Categories | Partial | High | Yes |
| Historical budget months | Partial | Critical | Yes |
| Transactions | Partial | Critical | Yes |
| Transaction check numbers | Supported | Low | No |
| Split transactions | Partial | High | Yes |
| Scheduled transactions | Partial | High | Yes |
| Payees | Partial | Medium | No |
| Transfers | Partial | Critical | Yes |
| Transaction flags | Partial | Medium | No |
| Reconciliation state | Partial | High | Yes |
| Credit cards | Partial | Critical | Yes |
| Import traceability | Partial | Medium | Yes |

## Recommended Build Order

Before actual import writes, build the missing representation pieces in this order:

1. Add category group/header notes support.
2. Map scheduled split transactions and prove YNAB4 recurrence mapping.
3. Prove historical monthly budget/category-month mapping.
4. Prove transfer-pair and credit-card migration against real YNAB4 data.
5. Wire `ImportRun`/`ImportMap` source-id tracking for YNAB4 entities.

## Why This Matters

Full YNAB4 import is not just importing transactions.

A faithful migration must preserve:

- structure
- history
- notes
- relationships
- scheduled behaviour
- cleared/reconciled state
- credit-card semantics
- enough metadata to validate/debug the migration

Without these pieces, an import could appear successful while silently losing data that mattered in YNAB4.

## Test Command

```bash
pnpm test:v162
```

## Build Verification

```bash
pnpm --filter @budget-app/web build
```
