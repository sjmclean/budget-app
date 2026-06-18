# Architecture

## Project vision

This project is a local-first replacement for YNAB4. The core goals are:

- Preserve the YNAB4 envelope-budgeting workflow.
- Keep the user's data local, portable, and offline-capable.
- Avoid mandatory subscriptions, hosted servers, and vendor lock-in.
- Support full YNAB4 migration.
- Provide a backend that can later support desktop, web/PWA, and iPad clients.

## Technology stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Database | SQLite |
| ORM/query layer | Drizzle ORM |
| SQLite driver | better-sqlite3 |
| Package manager | pnpm |
| Test runner | tsx scripts |
| Future UI | React, Vite, Tailwind, shadcn/ui, Zustand, TanStack Table |
| Future desktop shell | Tauri |

## Package responsibilities

```text
packages/application      Application services and user-facing workflows
packages/budget-engine    Pure domain calculations and factory/validation logic
packages/budget-file      .budget package, backups, attachments, lock files
packages/database         SQLite schema, Drizzle setup, database initialization
packages/repository       Repository interfaces and SQLite implementations
packages/security         Key derivation, password hashing, encrypted payload helpers
packages/sync             Local sync primitives and conflict/fingerprint helpers
packages/types            Shared domain types and result/error models
packages/ynab4-importer   YNAB4 preview, mapping, and database import
```

## Layering rule

Business rules should flow downward through the stack:

```text
Future React UI
    ↓
Application Services
    ↓
Budget Engine
    ↓
Repositories
    ↓
SQLite / budget.db
```

The UI should not talk directly to SQLite. Repositories should not contain budgeting policy. The budget engine should not know about Drizzle or files. Application services coordinate workflows such as importing, merging payees, committing bank imports, undo/redo, reconciliation, and scheduled transaction execution.

## Local-first storage model

Each budget is a folder-style package:

```text
Household.budget/
├── budget.db
├── budget.json
├── Attachments/
├── Backups/
└── Temp/
```

The package is movable and syncable as a normal folder. `budget.db` remains a normal SQLite database for speed and reliability, while attachments stay outside SQLite to avoid bloating database pages and backups.

## Current backend maturity

As of v1.2.15, the backend contains the main MVP foundations:

- Core budgeting entities and engine workflows.
- Accounts, categories, payees, transactions, splits, transfers, goals, scheduled transactions, reconciliation.
- YNAB4 import plus bank import foundations.
- Budget package, backup, restore, attachment, and lock-file support.
- Undo/redo, audit/event foundations, import rollback, search, indexes, and security/backups hardening.

Remaining large future areas are primarily UI-driven reporting, cloud provider integrations, mobile-specific workflows, and advanced multi-user collaboration.
