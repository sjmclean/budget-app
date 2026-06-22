# v1.46 Budget Registry Foundation

## Summary

v1.46 replaces the budget selector's hardcoded demo data with a persisted browser-local budget registry foundation.

This release prepares the application for budget lifecycle actions in a follow-up release:

- Reset current budget
- Delete current budget
- Return to budget selector after deletion

## Behaviour

- The registry is stored under `budget-app.budget-registry.v1`.
- A first-run registry is seeded with one starter budget: `Household Budget`.
- New budgets can be created from the selector.
- Budget ids are slugged and made unique.
- Opening a budget marks it as recently opened.
- Registry entries can be updated or deleted through the registry service.

## Intentional Scope Limit

This release does not yet reset or delete budget-owned data.

It only creates the registry foundation required for those destructive workflows to behave correctly in a multiple-budget application.

## Next Release

v1.47 should implement budget lifecycle actions:

- Reset Budget: keep the budget and settings, clear budget contents, recreate the default category template.
- Delete Budget: delete the current budget and all budget-owned data, then return to the budget selector.
