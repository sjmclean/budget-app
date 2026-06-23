# v1.58 YNAB4 JSON Import Audit and Direction

## Decision

Full YNAB4 migration must be based on the YNAB4 JSON data file.

CSV-based YNAB4 export/import is not the required migration path. CSV import remains useful for bank transaction imports, but it does not satisfy the project requirement for full YNAB4 migration.

## Import Boundaries

There are two separate import concepts:

| Area | Purpose | File Types | Scope |
| --- | --- | --- | --- |
| Register import | Bank/transaction import into an existing account register | CSV now, later QIF/OFX/QFX | Transactions only |
| Budget migration import | Full YNAB4 budget migration | YNAB4 JSON data file | Whole budget |

The register importer must not be repurposed to require or process YNAB4 JSON files.

## YNAB4 JSON Entry Points

Future YNAB4 import should be available at budget level, not account-register level.

Accepted entry points:

1. **Budget Launcher → Import Budget**
   - Non-destructive.
   - Select YNAB4 JSON file.
   - Preview migration.
   - Create a new budget.
   - Open the imported budget.

2. **Settings → Import / Migration**
   - Secondary access point for the same migration flow.
   - Default behaviour should still create a new budget.

3. **Settings → Reset Budget → Replace with YNAB4 Import**
   - Destructive.
   - Select YNAB4 JSON file.
   - Preview migration.
   - Explicitly confirm replace/reset.
   - Reset current budget and import into the existing budget shell.

## Import Modes

### Import as New Budget

- Mode: `new-budget`
- Destructive: no
- Creates a new budget: yes
- Requires existing budget: no
- Intended entry points:
  - Budget Launcher
  - Settings → Import / Migration

### Replace Current Budget

- Mode: `replace-current-budget`
- Destructive: yes
- Creates a new budget: no
- Requires existing budget: yes
- Intended entry point:
  - Settings → Reset Budget → Replace with YNAB4 Import

This mode must require strong confirmation because it wipes/replaces the current budget contents.

## Custom Progress Indicator Requirement

YNAB4 migration may take noticeable time. The user should not be left staring at an unchanging screen.

The migration flow should have a custom progress indicator showing the current phase, such as:

1. Reading YNAB4 file
2. Validating JSON
3. Analysing budget structure
4. Preparing migration preview
5. Preparing target budget
6. Importing accounts
7. Importing categories
8. Importing payees
9. Importing transactions
10. Importing scheduled transactions
11. Validating imported budget
12. Import complete

The progress indicator should be part of the migration UI, not just a browser spinner.

## Existing Codebase Finding

The existing `packages/ynab4-importer` package currently contains CSV-oriented YNAB4 import helpers and database import services. That work may still be useful as a mapping reference, but it is not sufficient for full migration because the required source is the YNAB4 JSON data file.

v1.58 adds a conservative JSON audit helper and import plan model. It does not implement full migration.

## Next Step

The next practical step is to test against a real or sanitised YNAB4 JSON data file.

The importer then needs to map JSON entities into the current model:

- Budget metadata
- Accounts
- Category groups
- Categories
- Category notes
- Category group/header notes
- Payees
- Transactions
- Split transactions
- Transfers
- Scheduled transactions
- Memos, notes, flags, cleared state
- Budget month data
- Income for month / next month behaviour

## Not Done in v1.58

- No full JSON importer yet.
- No migration commit yet.
- No real YNAB4 JSON fixture yet.
- No register importer changes.
- No destructive replace flow yet.
- No production migration UI yet.
