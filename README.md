# Budget App v1.2.9 — Database Integrity, Constraints & Code Documentation

This release continues the backend hardening phase after v1.2.8.

## Added in v1.2.9

- SQLite connection hardening:
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL`
- Database query/index hardening for:
  - transactions
  - accounts
  - categories
  - payees
  - scheduled transactions
  - budget months/category months
  - goals
  - transaction flags/tags/notes
  - imports
  - deleted items
  - undo records
- `DatabaseIntegrityApplicationService`
  - verifies foreign-key enforcement on the active connection
  - verifies required v1.2.9 indexes exist
  - runs `PRAGMA quick_check`
  - detects key orphan references
  - reports duplicate cleanup candidates
- Detailed comments added around important backend logic, especially:
  - transaction lifecycle management
  - import rollback
  - category merge
  - account safety
  - database-backed search
  - command history / undo preview
  - database initialization and integrity checks

## Test

```bash
pnpm install
pnpm test:v129
pnpm test:all
```

## Important note

This release intentionally does not add aggressive unique constraints yet. YNAB4 imports may contain messy duplicate payees/categories/tags, and those need explicit cleanup workflows rather than failed writes. v1.2.9 focuses on safe indexes, integrity inspection, and detailed code comments without risking destructive migration behaviour.


## v1.2.10 – Real Undo/Redo + Import Transaction Safety

This release turns the previous command-history foundation into executable backend undo/redo support and hardens YNAB4 imports so failed imports do not leave partial data behind.

Added:

- `UndoRedoApplicationService` for executable undo/redo commands.
- Persistent command history records in SQLite.
- Transaction edit/delete/restore undo and redo payload support.
- Account/category/payee update payload support for future GUI workflows.
- YNAB4 database import now runs inside a SQLite transaction.
- Failed imports automatically roll back partial accounts, categories, payees, transactions, and budget-month rows.
- v1.2.10 tests for real undo/redo and import transaction rollback safety.

Run:

```bash
pnpm test:v1210
pnpm test:all
```


## v1.2.11 Security, Backup Hardening & Contract Tests

This release hardens the backend before UI work by adding:

- Safe budget-package path resolution for attachments.
- Attachment file-name validation to prevent path traversal.
- Backup integrity manifests with SHA-256 file verification.
- Safe restore wrapper that validates backups before replacing a package.
- Stale lock inspection and lock heartbeat support.
- Scrypt-based password/key derivation helper for new security flows.
- Contract tests that catch factory/repository API drift like the v1.2.10 account factory mismatch.

Run:

```bash
pnpm test:v1211
pnpm test:all
```


## v1.2.12 Performance & Search Indexing

This release adds the performance/search layer needed before large real-world budgets and UI register screens:

- Indexed transaction search service with filtering, sorting, pagination, flag filters, tag filters, and text matching.
- Query-plan/index verification service for important register/search queries.
- Additional SQLite indexes for amount, created-at, flag colour, and note/search-heavy metadata.
- Tests for paginated search, combined filters, index presence, and query-plan regressions.

Run:

```bash
pnpm test:v1212
pnpm test:all
```

## v1.2.13 - Banking Import & Matching Foundation

Adds the Category A backend features that were intentionally parked before GUI work:

- CSV bank statement preview parser
- QIF preview parser
- OFX/QFX preview parser foundation
- Duplicate/matching suggestion service
- Payee rule matching service
- Auto-categorisation suggestion service
- Import issues/reporting model for non-fatal file problems

These services are preview/suggestion oriented by design. They do not write to SQLite directly; the GUI/import workflow should show users parsed rows, warnings, suggested matches, and payee/category suggestions before committing transactions.

### Tests

```bash
pnpm test:v1213
pnpm test:all
```

## v1.2.14 Final Backend Polish

This release is intended to close the last backend-polish items before the React GUI foundation.

Added:

- Bank import commit workflow for approved CSV/QIF/OFX/QFX previews.
- Bank import batch tracking and soft-delete undo for committed bank imports.
- Persisted payee-rule repository and management service.
- Payee-rule conflict detection for equal-priority duplicate patterns.
- Expanded executable undo/redo coverage for transaction edits.
- Foreign-key migration plan service documenting the safe SQLite table-rebuild path.
- v1.2.14 test group.

Run:

```bash
pnpm test:v1214
pnpm test:all
```

Notes:

- True SQLite foreign keys are still planned as a future migration because adding them safely to existing SQLite tables requires create-copy-validate-rename migrations.
- Bank import undo currently soft-deletes imported transactions rather than physically deleting them, preserving auditability.

---

# v1.2.15 Documentation & Developer Experience

This release adds the backend documentation set under `docs/`:

- `docs/architecture.md`
- `docs/application-engines.md`
- `docs/merchant-knowledge.md`
- `docs/design-principles.md`
- `docs/database-schema.md`
- `docs/budget-engine.md`
- `docs/budget-package-format.md`
- `docs/ynab4-import.md`
- `docs/bank-import-and-matching.md`
- `docs/undo-redo.md`
- `docs/security.md`
- `docs/search-and-indexing.md`
- `docs/testing.md`
- `docs/development-guide.md`
- `docs/api-reference.md`
- `docs/adr/`

Run the documentation presence check with:

```bash
pnpm test:v1215
```

## Development

Start the web application and Shared Platform API together from the repository root:

```bash
pnpm dev
```

The combined runner prefixes output with `[web]` and `[server]` and stops both processes when either exits or when you press `Ctrl+C`.

The services can still be run independently:

```bash
pnpm dev:web
pnpm dev:server
```

Refresh the persistence architecture inventory and report with:

```bash
pnpm audit:persistence
```

Verify that the committed audit is current with:

```bash
pnpm audit:persistence:check
```
