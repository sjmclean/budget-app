# Undo/Redo Architecture

Undo/Redo is a session-level, action-based command system. It keeps a short in-memory stack of commands that know how to execute and reverse one user action during the current app session.

Version History is different: it is snapshot-based, budget-scoped, and intended for longer-term recovery points. Backup packages are different again: they are portable files for disaster recovery, migration, and manual safekeeping.

## Command Model

Undoable commands live in `apps/web/src/features/history`. Each command has a stable `id`, a user-readable `label`, an `execute` function, and an `undo` function. A command may provide `redo`; when it does not, redo runs `execute` again.

Commands should capture only the state required to reverse their own action. For example, a future rename command should capture the previous and next names, not a whole budget snapshot. Commands should not hold React state, component instances, storage handles for persistence, or Version History data.

Large workflows can later be represented as composite commands that execute and undo smaller commands in a deliberate order. v284 only establishes the shared infrastructure and a test command; it does not migrate existing production workflows.

## Production Example: Money Movement

The money movement command is the first production-grade command. It moves assigned money between two budget categories, is created by `createMoveBudgetMoneyCommand` in `apps/web/src/features/budget/budgetMoneyMovement.ts`, and is executed through the v284 controller like any other `UndoableCommand`.

The command captures only the state required to reverse itself: month, source category ID, destination category ID, movement amount, original source assigned amount, and original destination assigned amount. It does not store a whole budget snapshot.

Execute applies the intended movement:

- source assigned decreases by the movement amount
- destination assigned increases by the movement amount
- total assigned money remains unchanged

Undo restores the captured original assigned amounts exactly. It does not subtract the reverse amount from the current values, because later recalculation, decimal precision, or another local mutation could make reverse arithmetic restore the wrong values. The captured originals are the authoritative pre-command state.

Redo reapplies the deterministic target amounts derived from those captured originals and the original movement amount. Failed execute operations do not enter the undo stack; failed undo and redo operations leave their command on the stack they came from.

## Controller

The history controller supports command execution, undo, redo, clear, stack labels, stack depths, configurable retention, busy protection, and subscriptions for React consumers. Failed execute, undo, or redo operations return explicit results and leave the stacks in their previous valid state.

The undo stack is not persisted. Closing or refreshing the app clears session-level Undo/Redo.

## Boundaries

Persistence, automatic snapshots, Version History, and backup packages must not depend on the undo stack. Undo/Redo is for short-lived action reversal. Version History is for point-in-time recovery. Backup packages are for portability and disaster recovery.

Keyboard shortcuts are resolved through the history helper but are not globally registered in v284. Future callers may wire Ctrl+Z/Cmd+Z and redo shortcuts into specific app shells when that can be done without changing existing editing behavior.
