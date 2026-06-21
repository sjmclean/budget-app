# v1.27 Budget Activity Persistence Port

## Purpose

Budget activity previously read register and scheduled-transaction browser storage directly from `budgetViewService`.

That made the budget screen a blocker for future SQLite-backed persistence because the budget service bypassed the persistence gateway and knew about register/scheduled localStorage keys.

## Change

v1.27 introduces `BudgetActivityPersistencePort` and moves register/scheduled activity storage access into a browser-localStorage adapter.

The budget service now receives budget-activity dependencies through `createBudgetViewService(...)`.

Current runtime behaviour remains localStorage-backed, but direct register/scheduled storage access has moved out of the budget domain service.

## Still intentionally unchanged

- Budget view storage still uses localStorage for assigned/category layout data.
- Register storage still uses localStorage.
- Scheduled transaction storage still uses localStorage.
- No SQLite adapter is introduced in this release.
- No budget calculation behaviour is intentionally changed.

## Next step

v1.28 should focus on LocalStorage Adapter Extraction: consolidate remaining localStorage ownership behind concrete adapter implementations so the SQLite adapter can implement the same ports cleanly.
