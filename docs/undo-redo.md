# Undo and Redo

Undo/redo is implemented through persistent command history, mainly in `UndoRedoApplicationService` and repository command-history records.

## Design goals

- Undo should survive app restart because the budget is local-first.
- Undo data lives with the budget in SQLite.
- Commands store explicit payloads rather than relying on implicit event replay.
- Redo is possible after undo while the command remains valid.

## Command history

Each command stores:

- Budget ID.
- Entity type and ID.
- Command type.
- Undo payload JSON.
- Redo payload JSON.
- Status (`done` or `undone`).
- Execution/undo/redo timestamps.

## Payload model

Supported payloads include transaction insert/update/delete/restore and account/category/payee updates. Expanded undo coverage was added in v1.2.14, but new complex workflows should explicitly add undo payloads and tests.

## What should be undoable?

Generally undoable:

- Transaction edits/deletes/restores.
- Payee/category/account edits.
- Payee/category merges where payloads include enough data.
- Bank import commit batches.

Usually not undoable:

- Restoring a backup over the whole budget.
- Security/key changes without a dedicated recovery design.
- Migrations, except by restoring backup.

## Development rule

Every new mutating application workflow should answer:

1. Is this undoable?
2. What is the minimal undo payload?
3. What is the redo payload?
4. What tests prove it works?
