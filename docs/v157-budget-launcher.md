# v1.57 Budget Launcher and Start-from-Scratch Flow

## Purpose

The budget registry existed before this release, but the UI did not provide a complete way to return to budget selection, switch budgets, or deliberately create a new blank budget from scratch after entering the app.

v1.57 makes the root route (`/`) an intentional budget launcher.

## User-facing behaviour

Users can now:

- return to the budget launcher from the top bar using **Switch budget**;
- return to the launcher from the sidebar brand area;
- create a new blank budget with a name;
- open any existing budget from the launcher.

Creating a budget selects it immediately and opens the dashboard.

Deleting the current budget clears the active budget selection and returns the user to the budget launcher. The application does not automatically select another budget after delete. The user chooses the next budget manually or creates/imports one from the launcher.

Resetting the current budget remains different: reset keeps the user in the same budget shell after wiping/recreating that budget's contents.

## Launcher UX direction

The chosen launcher direction is the darker premium/glass style from mockup option F.

The launcher deliberately avoids showing budget setup details during creation. The create form asks only for a budget name.

## Design decisions

- The root route (`/`) is the budget launcher.
- App routes require an explicitly selected active budget.
- If the selected budget is invalid or deleted, app routes return to the launcher instead of falling back to another budget.
- Creating a budget requires a non-empty name.
- Currency currently defaults to AUD behind the scenes.
- Currency, date format, start month, account setup, and other first-run settings are pinned for a future setup wizard.
- The older hard-coded placeholder budget list is no longer relevant and must not drive fallback behaviour.

## Files changed

- `apps/web/src/features/budget/activeBudget.ts`
- `apps/web/src/pages/BudgetSelectorPage.tsx`
- `apps/web/src/layouts/TopBar.tsx`
- `apps/web/src/layouts/Sidebar.tsx`
- `apps/web/src/styles/globals.css`
- `tests/v157-budget-launcher.ts`
- `package.json`

## Tests

Run:

```bash
pnpm test:v157
pnpm --filter @budget-app/web build
```

## Known limitations / future review

- No real `.budget` package picker yet.
- No import/restore shortcut on the launcher yet.
- No rename/delete controls on the launcher yet.
- New budget setup wizard is pinned for later.
- Currency/date/start-month setup is not yet part of the create-budget flow.
- The launcher UX should be reviewed again when real file-backed budgets are active.
