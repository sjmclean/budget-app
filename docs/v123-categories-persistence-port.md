# v1.23 Categories Persistence Port

## Purpose

This release continues the persistence unification work by moving category and
budget-screen category operations behind the shared `AppPersistenceGateway`.

The web UI should not import the concrete localStorage-backed budget service
when it is only trying to load or mutate categories. Instead, it now calls the
category persistence port exposed by the gateway.

## Scope

Added:

- `CategoryPersistencePort`
- `AppPersistenceGateway.categories`
- browser localStorage gateway wiring for categories
- budget view hook wiring through the categories port
- budget workspace mutation wiring through the categories port
- register category-option loading through the categories port

Preserved:

- existing localStorage behaviour
- current budget screen behaviour
- current category merge behaviour
- current register category dropdown behaviour

## Why categories are still tied to the budget view

The current web model stores categories as part of the budget month view. That
means category groups, category ordering, assigned values, activity, available
amounts, archive status, and category merge all live together in the
`budgetViewService`.

For that reason, `CategoryPersistencePort` is currently a narrow alias over the
category-related methods of `BudgetViewService` rather than a completely separate
category repository shape.

A later SQLite/Tauri adapter can implement the same port using the existing
package-layer repositories and application services.

## Not included

This release does not:

- move categories to SQLite yet
- redesign category management UI
- change category merge semantics
- change budget calculations
- remove `budgetViewService`

## Next recommended release

v1.24 should introduce a scheduled transactions persistence port before the
larger register persistence port work begins.
