# Budget Package Format

The application uses a folder-style `.budget` package rather than a single monolithic file.

## Structure

```text
Household Budget.budget/
├── budget.db
├── budget.json
├── Attachments/
├── Backups/
└── Temp/
```

## Why a folder package?

A single zipped package was considered but rejected for normal use because it would make SQLite and attachments slower and less reliable:

- SQLite needs direct random access.
- Rewriting a large ZIP after a small attachment change is inefficient.
- Cloud file-sync tools handle smaller changed files better than one large monolith.
- Attachments should not bloat normal database writes or backups.

The app can still offer an archive/export format later, but the working format is a folder package.

## `budget.db`

The SQLite database containing budgets, accounts, categories, transactions, settings, imports, history, and indexes.

## `budget.json`

A lightweight manifest read before opening SQLite. It identifies the package and stores metadata such as:

- Budget/package ID.
- Name.
- App/package version.
- Created/updated timestamps.
- Owner/local-user metadata.

## `Attachments/`

Stores files outside SQLite. The database stores attachment metadata and stable IDs. Files should be stored by generated IDs rather than user filenames to avoid collisions and illegal path characters.

## `Backups/`

Stores backup versions created by backup managers. v1.2.11+ includes backup integrity validation and safer restore handling.

## `Temp/`

Used for staging imports, restores, and future migrations. Temp files should not be considered canonical data.

## Lock files

Lock-file support is designed to prevent accidental concurrent editing across devices. The lock file contains device/app/opened-at information. Future cloud sync work should add heartbeat and stale-lock handling.

## Safety rules

- Never trust attachment or restore paths supplied by UI/import files.
- Keep attachments outside SQLite.
- Validate backups before restore.
- Prefer backup-before-migration and backup-before-import behaviours.
