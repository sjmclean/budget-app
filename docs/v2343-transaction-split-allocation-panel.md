# v2.34.3 Transaction Split Allocation Panel

Status: implemented as layout-only polish.

## Goal

Keep the existing split transaction workflow, but make the split editor read as a contained allocation panel rather than a compressed continuation of the register grid.

## Design decisions

- The parent transaction row remains unchanged.
- Split lines use their own layout: remove, category, memo, outflow, inflow.
- Category remains the highest-priority split field.
- Memo is secondary but still visible.
- Amount fields stay compact and aligned.
- The panel keeps the split allocation visually grouped with the transaction.
- Behaviour is unchanged.
