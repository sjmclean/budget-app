# v2.34.1 YNAB4 Category Sortable Index Fidelity

YNAB4 stores category display order using `sortableIndex` on both master categories and subcategories. The JSON array order is not the visual order shown in YNAB4.

Budget App now imports category groups and child categories using YNAB4 `sortableIndex` order instead of raw storage order. This preserves the source budget's visual hierarchy without hard-coding any user-specific category names.

## Rules

- Non-hidden master categories are sorted by `sortableIndex`.
- Subcategories are sorted by `sortableIndex` within each group.
- The special `Hidden Categories` group remains its own imported group and is displayed after visible groups.
- Hidden category child rows still preserve their `sortableIndex` order.
- Empty tombstoned master categories remain suppressed.

## Why

The uploaded YNAB4 reference budget stores master categories in a raw array order that differs from the order shown by YNAB4. Sorting by `sortableIndex` reproduces the YNAB4 visual category order for any budget rather than special-casing a specific user's category names.
