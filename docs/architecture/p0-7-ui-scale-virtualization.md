# P0.7 UI scale and budget virtualization

P0.7 bounds the amount of Budget workspace UI mounted at once without changing
persistence, financial calculations, or the existing row interaction implementation.

## Scope

The primary target is the Budget workspace.

Two large-budget shapes are handled:

1. many category groups whose combined expanded category count is large;
2. one or a few individual groups containing a very large number of categories.

The account register is not moved onto this virtualizer. It already has its own
specialized SQLite paging, loaded-window reconciliation, running-balance
reconstruction, and 150-row UI pagination boundary.

The Organise Categories dialog is intentionally separate because native drag/drop
depends on live destination rows while dragging. Reports are also unchanged in
this phase because they are presentation surfaces rather than the primary Budget
editing interaction.

## Group virtualization

`BudgetVirtualizedGroupList` activates when more than 250 categories are
expanded and more than 3 visible groups exist.

Above that threshold:

- viewport groups plus 800 px overscan are mounted;
- off-screen groups use height-preserving placeholders;
- mounted groups are measured with `ResizeObserver`;
- collapsed groups use header-only geometry;
- the selected group and the group owning an open category window are pinned.

Below the threshold, the existing group tree renders directly.

## Oversized-group row virtualization

`BudgetVirtualizedCategoryList` activates when one group contains more than
120 categories.

Above that threshold:

- viewport rows plus 700 px overscan are mounted;
- off-screen rows preserve measured or estimated geometry;
- the selected category remains pinned;
- every mounted row is still the canonical `BudgetCategoryRow`.

This prevents a single 2,000-category group from bypassing the group-level
virtualization boundary.

## Interaction invariants

P0.7 does not create alternate Budget interaction components. Existing
components continue to own selection, assigned-money editing, activity
drilldown, goals, cover overspending, context menus, settings, archived-category
presentation, credit-card payment behavior, and table layout.

Virtualization controls only whether an existing subtree is mounted.

## Scale tests

The structural contract covers both pathological shapes:

- 100 groups x 20 categories: fewer than 10 groups are in the tested viewport;
- one group x 2,000 categories: fewer than 50 rows are in the tested viewport;
- measured heights replace estimates without changing order;
- collapsed groups retain header-only geometry.

These are structural bounds rather than machine-specific timing thresholds.

## Architecture invariants preserved

P0.7 does not change SQLite/OPFS authority, command serialization, persistence
publication, P0.5 query caching, P0.6 projection replay/cache behavior, register
delta reconciliation, startup, or sync semantics. It adds no worker
subscription channel, second event bus, second financial authority, or alternate
Budget row implementation.
