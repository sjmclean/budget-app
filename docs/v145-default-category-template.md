# v1.45 Default Category Template

## Summary

v1.45 formalises the default category template used when a new budget view is created.

The template is a starter structure only. Categories copied from the template are not protected system categories. Once copied into a budget, they are normal user-owned categories that can be renamed, moved, archived, merged, and later deleted when the delete workflow exists.

## Template Groups

- Immediate Obligations
- Everyday Expenses
- True Expenses
- Quality of Life
- Savings

## Behaviour

When a budget/month view is created with no stored budget data, the app now copies the reusable default category template into that budget.

Each budget receives its own copy. Renaming or archiving a template-created category in one budget does not mutate the template or any other budget.

## Non-goals

v1.45 does not implement reset budget, delete budget, delete all app data, or protected system categories.

Those lifecycle actions are expected to build on this template in a later release.

## Validation

Run:

```bash
pnpm test:v145
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```
