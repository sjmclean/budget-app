# v2.35.2a Budget Sticky Stack Correction

## Summary

Corrects the Budget working header sticky behaviour so the month navigation, Ready To Assign summary, display controls, and column header behave as one stable sticky stack.

## Decision

The Budget screen should not rely on multiple visually independent sticky layers. The sticky region should own a single opaque background, z-index, and shadow so budget rows cannot visually pass through or overlap the working header while scrolling.

## Scope

- Keeps the global application chrome and Budget name scrollable.
- Keeps the sticky region starting at the Budget working context.
- Makes the sticky stack opaque and isolated.
- Keeps the Budget rows/card below the sticky stack in the stacking order.
- No budgeting logic changes.
