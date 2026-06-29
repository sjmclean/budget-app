# v2.33.2 Budget History UI

## Summary

This release exposes the Data Protection / Version History subsystem in Settings as **Budget History**.

The screen intentionally stays simple:

- Budget History lives under Settings → Data.
- The overview keeps external backups separate from internal history.
- The Budget History view lists rolling restore points grouped by date.
- Users can create a restore point with an optional description.
- Users can select a restore point, restore it, or delete it.
- The UI explains that Budget App keeps the last 30 restore points and prunes older entries automatically.

## Product decisions

Budget History is not undo/redo and is not external backup. It is a rolling, budget-scoped recovery history.

Manual restore points are normal snapshots with optional descriptions. They count toward the same 30-entry retention limit as automatic snapshots.
