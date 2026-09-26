# Explicit Monthly Income Model

## Purpose

This document defines the authoritative product contract for income, monthly
budget availability and direct-category inflows.

The model intentionally follows a simple month-based envelope approach:

- genuine general income is explicitly designated for the transaction month or
  the following month;
- money becomes generally budgetable in the month it is designated for;
- any amount left unbudgeted at month end carries forward chronologically;
- category balances carry forward independently;
- users do not create arbitrary assignments in distant future months;
- longer-term earmarking is represented by normal user-defined categories.

There are no production-user compatibility requirements for the superseded
global Ready to Assign / future-commitment model. Implementation should remove
obsolete behaviour rather than preserve parallel semantics.

## Core concepts

### Income for Month

For a transaction dated in month M, the normal transaction category picker
offers exactly two synthetic income destinations:

- **Income for M**
- **Income for M+1**

Examples:

- a 25 September transaction offers **Income for September** and **Income for
  October**;
- a 4 October transaction offers **Income for October** and **Income for
  November**.

These are system-generated choices. They are not ordinary persisted user
categories and cannot be renamed, archived, reordered or deleted.

Choosing one is the complete user-facing income-month decision. There is no
second "Budget in month" field.

### Available to Budget

The month-level unallocated pool is a derived balance. Its working product term
is **Available to Budget**.

For month M:

```text
Available to Budget(M) =
    Not Budgeted in M-1
  + Income for M
  + previous-month overspending adjustment
  - assignments made in M
```

The final UI wording may be polished during implementation, but the financial
meaning is fixed by this contract.

### Not Budgeted in Previous Month

General budget money does not expire at month end.

If September receives $1,000 of Income for September and only $900 is assigned
in September, the remaining $100 becomes part of October's Available to Budget.

That $100 is not October income. It is **Not Budgeted in September**.

### Category carry-forward

Positive category Available balances carry forward normally. Category
overspending follows the existing explicit overspending policy.

Longer-term earmarking is therefore performed with ordinary categories. For
example, a user may place money in an Annual Bills or Future Spending category
and allow that category balance to carry until needed.

## Canonical transaction semantics

Budget destination and reporting classification are separate concerns.

### General income

A general-income transaction has:

- an explicit income budget month equal to the transaction month or following
  month;
- no ordinary user category destination;
- income classification for reporting.

Conceptually:

```text
category = none
incomeBudgetMonth = YYYY-MM
inflowClassification = income
```

The Register still displays a synthetic category label such as **Income for
October**.

### Direct-category income

Some users intentionally pre-categorise income, especially in scheduled
transactions.

Example:

```text
Employer
Groceries
Inflow $500
Count this inflow as income = true
```

This increases Groceries directly and also counts as income in reporting.

It does not enter Available to Budget.

### Category inflow / refund

A positive inflow to a normal category is a category inflow by default.

Example:

```text
Supermarket
Groceries
Inflow $50
Count this inflow as income = false
```

This increases Groceries directly but does not count as income in reporting.

### Transfers

Transfers are not income. Internal on-budget transfers do not create category
activity or Available to Budget. Existing off-budget transfer/category
semantics remain governed by the financial engine.

## Contextual income classification UX

The user should not be asked to classify every transaction.

The **Count this inflow as income** control appears only when all of the
following are true:

- the transaction or split line has a positive inflow;
- it is assigned directly to a normal budget category;
- it is not a transfer;
- it is not one of the synthetic Income for Month choices.

The control is unchecked by default.

Choosing **Income for <month>** automatically classifies the amount as income,
so the contextual control is not shown.

Outflows and transfers never show the control.

## Split transactions

The model applies line-by-line.

Each split line may independently be:

- Income for transaction month;
- Income for following month;
- a direct-category inflow counted as income;
- a direct-category refund/category inflow;
- an expense;
- a transfer.

Reporting classification and income budget month therefore belong at split-line
granularity as well as parent-transaction granularity.

## Scheduled transactions

Scheduled transactions preserve intent rather than a fixed calendar month.

General scheduled income stores one of two relative policies:

- **Income for occurrence month**
- **Income for following month**

When an occurrence materialises, that relative choice resolves to the
occurrence's actual calendar month.

Example:

```text
September salary occurrence + policy "following month"
→ Income for October

October salary occurrence + policy "following month"
→ Income for November
```

A scheduled direct-category inflow stores its reporting classification, so a
pre-categorised salary can be configured once and generated repeatedly without
additional prompts.

## Imported transactions

### YNAB4

YNAB4 source semantics are preserved as active import behaviour:

- `Category/__ImmediateIncome__` → Income for transaction month;
- `Category/__DeferredIncome__` → Income for following month.

This applies to both parent transactions and split lines.

The imported result must use the same canonical model as a newly entered
transaction.

### Ordinary bank imports

A positive imported transaction with no reviewed destination must remain
uncategorised.

It must not silently become general income.

If the reviewed destination is an Income for Month choice, it becomes general
income for that month. If the reviewed destination is a normal category, the
review flow may expose the same contextual Count as income choice used by normal
transaction entry.

## Month editing and validation

For a transaction dated in month M, an explicit general-income budget month is
valid only when it equals M or M+1.

Earlier months and M+2 or later are invalid.

If editing the transaction date makes the existing synthetic Income for Month
choice invalid, the editor must resolve the invalid state visibly rather than
silently preserve an impossible month.

Implementation should favour the nearest equivalent valid choice while keeping
the changed category visible to the user. This interaction requires browser
acceptance coverage.

## Future budgeting

Arbitrary future assignments are not part of this product model.

The intended planning horizon is the current budget month and the immediately
following budget month, supporting the common one-month-ahead workflow.

Users may not assign current money directly into distant future budget months.

Money can still reach later months by:

- remaining unbudgeted and carrying forward chronologically; or
- being assigned to a user-defined category whose Available balance carries
  forward.

The superseded backward-reservation model is removed. The application does not
calculate a current-month "planning" balance by subtracting assignments made in
later months.

## Required removal of superseded behaviour

Implementation should remove, rather than retain compatibility branches for:

- Ready to Assign as an income transaction category;
- a separate Income Budget Month selector;
- arbitrary future Income for Month options;
- null/absence as the canonical representation of same-month income;
- blank positive inflows silently becoming general income;
- forward-aware planning Ready to Assign;
- future assignment reservation;
- future overcommitment/future commitment presentation;
- configurable arbitrary-future budgeting where no independent product use
  remains.

## Reporting contract

Reports must consume explicit financial classification rather than infer income
from `amount > 0`.

At minimum, reporting must distinguish:

- genuine income;
- category refunds/inflows;
- transfers;
- expenses.

A direct-category salary marked as income must count as income. A supermarket
refund to the same category must not.

## Undo/redo and persistence

All canonical financial fields must be included in authoritative SQLite
transaction/split records and complete history snapshots.

Add, edit, delete, undo and redo must preserve:

- income budget month;
- direct-category income classification;
- split-line classification;
- transfer relationships;
- category destination.

There is no dual legacy representation.

## Acceptance scenarios

### Same-month income

```text
25 Sep  Employer  +$1,000  Income for September
```

September Income for September increases by $1,000.

If $900 is assigned in September, September closes with $100 not budgeted and
October opens with that $100 carried forward.

### One-month-ahead income

```text
25 Sep  Employer  +$2,000  Income for October
```

September receives no general budget income from this transaction.

October Income for October increases by $2,000.

### Mixed month designations

```text
10 Sep  Employer A  +$1,000  Income for September
25 Sep  Employer B  +$2,000  Income for October
```

September income is $1,000. October income is $2,000.

### Direct-category salary

```text
Employer  Groceries  +$500
Count this inflow as income = true
```

Groceries increases by $500. Reports include $500 of income. Available to
Budget does not increase.

### Refund

```text
Supermarket  Groceries  +$50
Count this inflow as income = false
```

Groceries increases by $50. Reports do not include the $50 as income. Available
to Budget does not increase.

### Editing income month

Changing a September-dated transaction from Income for September to Income for
October removes the amount from September income and adds it to October income
atomically. Undo restores the previous state.

### Deleting income

Deleting Income for October removes that income from October even when the
transaction date is in September. Undo restores it.

### Split income

Each positive split line follows its own budget destination and reporting
classification without changing the parent transaction date.

## Implementation guardrails

- SQLite/OPFS remains the sole interactive financial authority.
- `projectBudget()` remains the authoritative chronological budget projection.
- Derived monthly summaries are not persisted as competing financial facts.
- UI code does not independently reproduce budget arithmetic.
- No compatibility path is added for the superseded native model.
- YNAB4 import semantics are preserved because they are an active import
  feature, not because of native backward compatibility.
