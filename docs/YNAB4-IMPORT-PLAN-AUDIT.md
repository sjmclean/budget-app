# YNAB4 launcher import-plan audit

## Scope

This audit reviewed the active browser YNAB4 path in `budget-app(394)`, after the shared package reader and shared amount decoder had been introduced.

## Finding

The importer still combined two distinct responsibilities in `writeImportedBudgetData`:

1. mapping raw YNAB4 source records into application-domain objects; and
2. writing those objects directly to browser storage.

That coupling made it impossible to inspect, test, validate, preview, or reuse the mapped result before persistence. It also meant later extractions such as transfer resolution and budget mapping had no stable intermediate model to target.

## Implementation

The former combined function has been replaced by two explicit stages:

- `buildYnab4LauncherImportPlan(...)`
- `writeYnab4LauncherImportPlan(...)`

`buildYnab4LauncherImportPlan` performs all current mapping and returns a `Ynab4LauncherImportPlan` without receiving or mutating storage.

`writeYnab4LauncherImportPlan` is the only function in this stage that knows the browser storage keys.

The plan currently contains:

- accounts;
- payees;
- imported transaction tags;
- account registers and transactions;
- scheduled transactions;
- monthly budget views;
- persistence warnings.

## Behavioural impact

No mapping rules, transfer rules, amount rules, recurrence rules, budget calculations, storage keys, or audit rules were intentionally changed. The existing importer now builds the plan, writes it, and then runs the existing post-persistence accuracy audit.

## Architectural boundary

This is deliberately named `Ynab4LauncherImportPlan`. It is a canonical intermediate model for the active launcher path, but it is not yet a backend-neutral package-level import model. It still contains application view models such as `SidebarAccount`, `AccountRegisterView`, and `BudgetMonthView`.

A later phase can move the plan and focused mappers into dedicated modules once the current behaviour is protected by feature tests.

## Tests

`tests/suites/ynab4/import-plan.test.ts` verifies that:

- the mapping stage can build a plan without storage;
- the expected month is present;
- the writer persists the supplied plan to the existing scoped keys;
- the builder and writer remain separate responsibilities.
