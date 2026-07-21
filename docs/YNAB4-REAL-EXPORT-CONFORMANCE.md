# YNAB4 real-export conformance

The importer is verified against a purpose-built YNAB4 export fixture at
`tests/fixtures/ynab4/conformance/Budget-19-comprehensive.yfull`.

The fixture records source behaviours that are easy to misinterpret from field
names alone:

- a closed account is serialized with `hidden: true`;
- a tracking account is an ordinary account with `onBudget: false`;
- hidden categories are children of `MasterCategory/__Hidden__` and retain live
  transaction and monthly-budget references;
- deleted categories are tombstoned only after their activity is reassigned;
- posted and scheduled transfers use `targetAccountId` and a structural transfer
  payee;
- an on-budget leg crossing to an off-budget account may retain a real category;
- scheduled on-budget-to-off-budget transfers may likewise be categorized;
- cleared status preserves `Uncleared`, `Cleared`, and `Reconciled`.

`tests/suites/ynab4/real-export-conformance.test.ts` builds the normal,
persistence-independent import plan from the fixture and asserts these
semantics. The fixture is intentionally retained as a regression asset rather
than replacing the existing focused mapper tests.
