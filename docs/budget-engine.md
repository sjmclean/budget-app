# Budget Engine

The budget engine lives in `packages/budget-engine`. It contains domain factories, validators, calculations, reports, and budgeting workflows. It should remain free of UI, Drizzle, SQLite, and filesystem concerns.

## Core concepts

### Assigned

Money intentionally budgeted to a category in a month.

### Activity

Net transaction activity for the category in a month.

### Available

Money currently available in a category after assigned funds and activity are applied.

### Ready To Assign / Ready To Budget

Budget-level money available for assignment after income, overspending decisions, and rollover behaviour are applied.

## Month rollover

The rollover behaviour follows the YNAB4-compatible policy chosen for this project:

- Positive category available balances roll forward.
- Negative available balances are treated as overspending.
- Overspending can be explicitly covered or left overspent.
- If left overspent, the next month’s ready-to-assign amount is reduced.

This is implemented through services such as:

- `rolloverBudgetMonth.ts`
- `leaveOverspent.ts`
- `coverOverspending.ts`
- `applyOverspendingDecision.ts`

## Overspending workflow

The selected behaviour is explicit-decision overspending:

1. Warn the user.
2. Require a decision:
   - Cover overspending from another category, or
   - Leave overspending.
3. If left, reduce future ready-to-assign funds.

This avoids silently hiding overspending while remaining compatible with YNAB4-style budget rollovers.

## Future month limits

Unlimited future budgeting was rejected. The system supports a configurable maximum number of future months, defaulting to the budget setting. `validateFutureMonth.ts` and related services enforce this before assignments are accepted.

## Credit card handling

Credit card logic is isolated in `creditCardEngine.ts` and related tests. The backend distinguishes between spending, payments/transfers, debt handling, and positive/negative balances. The UI should present this as a budgeting workflow rather than raw accounting entries.

## Goals

Goals are stored as domain records and evaluated by `calculateGoalProgress.ts`. Current goal support includes target tracking and progress calculation. Future UI work can add goal templates and visual progress indicators without changing the core storage model.

## Reports

The engine already contains basic report helpers:

- `accountBalances.ts`
- `netWorth.ts`
- `spendingByCategory.ts`

These are intentionally small backend foundations. More advanced reports should be driven by UI needs and real usage.

## Rule for new engine code

New budget calculations should:

1. Accept plain domain objects.
2. Return plain values or typed results.
3. Avoid reading from repositories directly.
4. Include scenario tests in `tests/`.
5. Include comments where behaviour preserves YNAB4 semantics.
