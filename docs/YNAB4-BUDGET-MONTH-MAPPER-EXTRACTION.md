# YNAB4 budget-month mapper extraction

The YNAB4 launcher no longer owns monthly budget reconstruction directly.

`apps/web/src/features/budget/ynab4/mapYnab4BudgetMonths.ts` now maps source
monthly budgets plus imported register activity into persistence-independent
`BudgetMonthView` values. It owns assigned amounts, activity, available
balances, carryover behaviour, Ready to Assign fallback handling, month
ordering, and empty-source month synthesis.

The launcher remains responsible for orchestration and passes the resulting
month map into the existing import plan writer. No persistence keys or write
behaviour moved into the mapper.
