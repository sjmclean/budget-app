# v2.34.0 YNAB4 Category View Fidelity

## Status
Implemented.

## Problem
YNAB4 category import previously prioritised reconstructing original category placement from hidden-category metadata. That preserved some historical references, but it could make the imported Budget App category tree look very different from the YNAB4 budget view.

## Decision
The YNAB4 category tree is now treated as the source of truth for the imported budget view.

Imported category groups and categories should preserve:

- displayed master-category order,
- displayed category order within each group,
- the `Hidden Categories` group as an actual displayed group,
- hidden category display names without rehoming them into their former groups,
- archived/tombstoned category state.

Deleted/tombstoned empty master categories remain suppressed so they do not become empty visible groups.

## Non-goal
This release does not redesign the YNAB4 import UI and does not attempt to reproduce every YNAB4 collapse/expand or visibility preference. It only fixes the imported category tree/source-of-truth behaviour.

## Test
`tests/v2340-ynab4-category-view-fidelity.ts` verifies that hidden categories remain under `Hidden Categories`, group/category ordering is preserved, empty tombstoned groups are suppressed, and active categories remain active.
