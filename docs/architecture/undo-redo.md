# Undo/Redo Architecture

Undo/Redo is a session-level, action-based command system. It keeps a short in-memory stack of commands that know how to execute and reverse one user action during the current app session.

Version History is different: it is snapshot-based, budget-scoped, and intended for longer-term recovery points. Backup packages are different again: they are portable files for disaster recovery, migration, and manual safekeeping.

## Command Model

Undoable commands live in `apps/web/src/features/history`. Each command has a stable `id`, a user-readable `label`, an `execute` function, and an `undo` function. A command may provide `redo`; when it does not, redo runs `execute` again.

Commands should capture only the state required to reverse their own action. For example, a future rename command should capture the previous and next names, not a whole budget snapshot. Commands should not hold React state, component instances, storage handles for persistence, or Version History data.

Large workflows can later be represented as composite commands that execute and undo smaller commands in a deliberate order.

## Production Example: Money Movement

The money movement command moves assigned money between two budget categories and is created by `createMoveBudgetMoneyCommand` in `apps/web/src/features/budget/budgetMoneyMovement.ts`.

The command captures only the state required to reverse itself: month, source category ID, destination category ID, movement amount, original source assigned amount, and original destination assigned amount. It does not store a whole budget snapshot.

Execute applies the intended movement:

- source assigned decreases by the movement amount
- destination assigned increases by the movement amount
- total assigned money remains unchanged

Undo restores the captured original assigned amounts exactly. Redo reapplies the deterministic target amounts derived from those captured originals and the original movement amount.

## Grouped Manual Assignment Editing

Manual edits to Assigned values use a separate `BudgetAssignmentChangesCommand`. The budget grid remains fluid: each edit is reflected optimistically, while edits made within a short idle window are collected into one assignment-edit session.

For example:

- Emergency Fund: 500 to 450
- Mobile: 100 to 150

becomes one history entry: `Change 2 budget assignments`.

The command captures the original and final Assigned value for every touched category. Undo restores all original values atomically, and Redo reapplies all final values atomically. Repeated edits to the same category retain the first original value and the latest final value. Returning a category to its original value removes it from the pending session.

Explicit Move Money and Cover Overspending remain separate commands with more descriptive labels. Both command types share the same controller and history stack.

Pending manual edits are flushed before Undo or Redo, so an immediate keyboard shortcut reverses the complete pending assignment session rather than missing uncommitted grid edits.

## Controller

The history controller supports command execution, undo, redo, clear, stack labels, stack depths, configurable retention, busy protection, and subscriptions for React consumers. Failed execute, undo, or redo operations return explicit results and leave the stacks in their previous valid state.

The undo stack is not persisted. Closing or refreshing the app clears session-level Undo/Redo.

## Boundaries

Persistence, automatic snapshots, Version History, and backup packages must not depend on the undo stack. Undo/Redo is for short-lived action reversal. Version History is for point-in-time recovery. Backup packages are for portability and disaster recovery.
