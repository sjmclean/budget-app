# v1.59 YNAB4 Package Discovery & Preview

## Purpose

v1.59 moves the YNAB4 migration work from a generic JSON audit to the real YNAB4 package shape.

A real YNAB4 budget is not a CSV export and is not just an arbitrary JSON file. It is a `.ynab4` package/folder containing metadata and one or more data folders.

The migration flow must understand the package structure before any import writes are attempted.

## Real YNAB4 package structure

A typical YNAB4 package contains:

```text
My Budget~A4A23FD4.ynab4/
  Budget.ymeta
  data32-73E5B868/
    <device-id>/
      Budget.yfull
      Budget.json
  Backup_....y4backup
```

`Budget.ymeta` contains the active data folder pointer:

```json
{
  "formatVersion": "2",
  "relativeDataFolderName": "data32-73E5B868"
}
```

The importer should use this pointer to locate the current budget data rather than guessing from the newest-looking folder.

## Discovery-only scope

v1.59 does **not** import data into the app yet.

It discovers:

- package root
- budget name inferred from package name
- `Budget.ymeta`
- active data folder
- active `Budget.yfull` or `Budget.json`
- top-level YNAB4 sections
- preview counts

It counts:

- accounts
- master categories / category groups
- categories
- payees
- monthly budgets
- transactions
- scheduled transactions
- category notes
- category group notes

## Progress indicator requirement

The real sample budget is large enough that users need visible progress during migration.

The discovery model provides progress steps suitable for a future custom migration UI:

```text
Reading YNAB4 package
Validating YNAB4 metadata
Analysing YNAB4 budget data
Preparing migration preview
```

Later import phases should extend this into account/category/payee/transaction/scheduled transaction progress.

## Entry points remain budget-level

YNAB4 migration remains a budget-level workflow.

Valid future entry points:

```text
Budget Launcher -> Import Budget
Settings -> Import / Migration
Settings -> Reset Budget -> Replace with YNAB4 Import
```

The register import remains for transaction/bank imports only.

## Future work

v1.60 should likely add the UI discovery/preview flow:

```text
Select .ynab4 package / extracted package contents
Read Budget.ymeta
Read active Budget.yfull
Show preview counts
Continue / Cancel
```

No data should be written until the preview has been reviewed and the user confirms the import mode.
