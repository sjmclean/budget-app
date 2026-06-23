# v1.61 YNAB4 Data Extraction Audit

## Purpose

v1.61 verifies that the importer can extract the major YNAB4 data areas before any database writes are attempted.

This continues the YNAB4 migration stream:

- v1.58 confirmed that full migration must use the real YNAB4 JSON package data, not CSV exports.
- v1.59 discovered the real `.ynab4` package structure.
- v1.60 added a launcher preview with drill-down samples.
- v1.61 audits the data that must eventually be mapped into the app.

## Important correction from real YNAB4 package testing

A real YNAB4 package may not store the active `Budget.yfull` file directly under the active data folder.

Observed structure:

```text
Budget.ymeta
  relativeDataFolderName = data32-73E5B868

data32-73E5B868/
  <device-or-budget-guid>/
    Budget.yfull
    *.ydiff
```

The discovery logic now searches recursively under the active data folder and prefers `Budget.yfull` over `Budget.json`.

## Audit output

The new audit function reports:

- accounts
- category groups
- categories
- payees
- monthly budgets
- transactions
- scheduled transactions
- notes and metadata

Each audit item includes:

- entity key
- label
- status
- count
- sample fields
- notes

Statuses:

```text
found
missing
needs-mapping
unknown
```

`needs-mapping` is used when the entity exists but contains YNAB4-specific semantics that require explicit mapping decisions before import.

## Known YNAB4 data that needs mapping

### Payees

YNAB4 payees can include:

- transfer target account references
- auto-fill category
- auto-fill amount
- auto-fill memo
- rename conditions

These must not be flattened blindly.

### Monthly budgets

YNAB4 monthly budget data is required for historical budget fidelity.

This must be mapped before the app can claim full YNAB4 migration.

### Transactions

YNAB4 transactions may include:

- transfers
- split transactions
- tombstones/deleted records
- memos
- flags
- cleared state
- accepted state
- transfer transaction links

The importer must preserve the intended meaning of each of these.

### Scheduled transactions

Scheduled transactions may include:

- recurrence/frequency data
- transfer target account data
- split transaction data

This requires a dedicated mapping phase.

### Notes

The app has a pinned feature for individual category notes, but YNAB4 can also contain category group/header notes.

The import requirement is:

- preserve individual category notes
- preserve category group notes, even if the first UI implementation does not expose group-note editing

## Non-goals

v1.61 does not:

- create budgets
- import accounts
- import transactions
- write to persistence
- mutate the current budget

It is still an audit/extraction milestone.

## Verification

Run:

```bash
pnpm test:v161
pnpm --filter @budget-app/web build
```

## Recommended next step

v1.62 should define the YNAB4-to-app mapping layer.

Recommended mapping targets:

- YNAB4 account → app account
- YNAB4 category group/category → app category tree
- YNAB4 payee → app payee
- YNAB4 transaction → app transaction/transfer/split
- YNAB4 monthly budget → app historical budget values
- YNAB4 scheduled transaction → app scheduled transaction
- YNAB4 notes → category/category-group note preservation path

Only after that should the project begin actual import writes.
