# ADR-009: Explicit Monthly Income and One-Month-Ahead Budgeting

## Status

Accepted

## Context

The application previously combined a Ready to Assign transaction pseudo-category
with optional income-month metadata and a forward-aware future-commitment layer.
That model allowed arbitrary future income destinations and later-month
assignments to reserve money backwards against an earlier month's displayed
balance.

The product direction is to use a simpler YNAB4-style monthly envelope model.
Income intent should be visible directly in the transaction category choice,
unbudgeted money should carry forward chronologically, and longer-term earmarking
should happen through normal categories rather than distant future assignments.

There are no production-user backward-compatibility requirements for the
superseded native model.

## Decision

For a transaction dated in month M, general income may be designated only as:

- **Income for M**; or
- **Income for M+1**.

These are synthetic system category choices, not ordinary category records.

The canonical transaction records the income budget month explicitly for both
same-month and following-month income. Absence of the field is not used as a
same-month shorthand.

General income first becomes available to budget in its designated month.

Any general budget amount left unassigned at the end of a month carries forward
chronologically into the following month's available-to-budget pool. It is
carried money, not new income.

Positive category Available balances continue to carry forward. Users who want
to earmark money for a later purpose use ordinary user-defined categories.

Arbitrary future category assignments are not supported. The normal editable
planning horizon is the current budget month and the immediately following
budget month.

The forward-reservation/global-pool model is removed, including planning Ready
to Assign, future assigned totals, future overcommitment and future commitment
presentation.

Budget destination and reporting classification are independent. A positive
inflow to a normal category is a category inflow by default, but may be
explicitly marked as genuine income. The UI exposes that choice contextually
only for positive direct-category inflows. Income for Month choices imply
income automatically.

Scheduled general income stores a relative occurrence-month or following-month
policy. YNAB4 ImmediateIncome and DeferredIncome map to the same canonical model.

## Consequences

The transaction category picker can express income intent without a second
month selector.

Reports can distinguish genuine income from refunds and reimbursements instead
of treating every external positive amount as income.

The monthly projection remains chronological:

```text
available-to-budget(M) =
    not-budgeted-in-(M-1)
  + income-for-M
  + previous-overspending-adjustment
  - assignments-in-M
```

The application no longer needs backwards reservation of earlier money against
later assignments.

The configurable arbitrary-future budgeting decision recorded in former
ADR-004 no longer applies and that ADR is removed.

Implementation is expected to delete obsolete compatibility code and
documentation rather than retain dual behaviour.
