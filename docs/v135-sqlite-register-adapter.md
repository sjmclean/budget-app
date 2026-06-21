# v1.35 SQLite Register Adapter Foundation

## Purpose

Move the backend migration forward by adding a SQLite-backed foundation for the web account register persistence port.

This release does not activate SQLite at runtime. It creates and validates the adapter needed before runtime activation can safely happen.

## Scope

Implemented a SQLite-backed `AccountRegisterPersistencePort` adapter for standard transaction workflows:

- Load account register view through `AccountRegisterApplicationService`
- Add standard transactions through `TransactionRepository.create`
- Create missing payees through `PayeeRepository.create`
- Update standard transactions through `TransactionRepository.update`
- Toggle cleared / uncleared status
- Delete transactions through repository soft delete
- Preserve running balance behaviour via the existing application service read model

## Explicit Non-Scope

The adapter deliberately rejects mutation paths that still need their own backend migration work:

- Transfer mutation
- Split transaction mutation
- Attachment mutation

These guards prevent accidental runtime activation from silently dropping unsupported register behaviours.

## Important Design Decision

v1.35 does not add `closedAt` or `closed_at` to the account domain or SQLite schema.

The v1.34 audit found that account closure is currently a web/sidebar localStorage concern, not part of the domain `Account` model. The backend migration should not expand the account schema merely to force runtime activation.

## Validation

Added:

```bash
pnpm test:v135
```

and extended:

```bash
pnpm test:release-integrity
```

The v1.35 test validates the adapter against real SQLite repositories and a real temporary database.

## Runtime Status

Runtime SQLite activation remains off by default.

After v1.35, the validated backend chain includes:

```text
AccountRegisterPersistencePort
 ↓
SqliteAccountRegisterPersistenceAdapter
 ↓
AccountRegisterApplicationService
 ↓
SQLite repositories
 ↓
SQLite database
```

Remaining activation blockers include categories, budget view, scheduled transactions, and unsupported register mutation parity for transfers/splits/attachments.
