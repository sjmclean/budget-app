# v1.36 SQLite Register Transfer Validation

## Goal

Extend the SQLite register adapter beyond standard transaction persistence by validating the two-account transfer workflow through repository-backed SQLite persistence.

This release keeps runtime activation disabled. It proves that the register adapter can now persist, read, update, clear, and soft-delete paired transfer rows without browser `localStorage`.

## Scope

Implemented and validated:

- Transfer transaction creation from the source register.
- Opposing transfer row creation in the target register.
- Register read-model transfer display names:
  - `Transfer: Target Account` on the source side.
  - `Transfer: Source Account` on the target side.
- Transfer category display as `Transfer`.
- Source and target working balance recalculation.
- Mirrored cleared status for transfer pairs.
- Mirrored transfer update for date, memo, and amount.
- Mirrored soft-delete for transfer pairs.
- No payee rows are created for transfers.

Still intentionally out of scope:

- Split transaction mutation.
- Attachment mutation.
- Runtime gateway activation.
- Browser/Tauri persistence selection changes.

## Validation

Run:

```bash
pnpm test:v136
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```

The v1.36 test uses real SQLite repositories and does not use browser `localStorage`.

## Release Decision

v1.36 moves the backend migration forward by removing transfers as a register adapter blocker.

The remaining major register adapter gaps before activation are:

1. Split transaction mutation.
2. Attachment mutation or a deliberate runtime fallback decision.
3. Gateway composition validation using SQLite accounts, payees, and account registers together.
