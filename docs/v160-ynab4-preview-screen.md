# v1.60 YNAB4 Preview Screen

## Purpose

v1.60 makes the YNAB4 migration flow visible from the Budget Launcher without writing any imported data yet.

The goal is to let the user select a real `.ynab4` package folder, analyse its active YNAB4 data file, and preview what would be imported before any new imported budget is created.

## Confirmed Direction

YNAB4 migration is budget-level migration, not register transaction import.

Register import remains for bank/transaction files such as CSV/QIF/OFX/QFX.

YNAB4 import belongs in budget-level flows:

- Budget Launcher → Import YNAB4 Budget → Import as New Budget
- Settings / Reset → Replace Current Budget from YNAB4 Import (future advanced/destructive flow)

## v1.60 Scope

Implemented:

- Budget Launcher YNAB4 preview panel
- `.ynab4` package folder selection using browser directory selection
- `Budget.ymeta` / active data folder discovery through the v1.59 analyser
- Counts preview for accounts, category groups, categories, payees, monthly budgets, transactions, scheduled transactions, and notes
- Drill-down preview sections for accounts, categories, payees, notes, scheduled transactions, and transaction samples
- Context text explaining that long drill-down lists are capped samples, not full record browsers
- Launcher import is fixed to Import as New Budget only
- Custom progress-step preview model
- Tests for preview generation and progress phases

Not implemented yet:

- Import commit
- Budget creation from YNAB4 data
- Reset/replace current budget execution from Settings
- ZIP extraction in browser
- Database writes
- Mapping validation beyond discovery counts

## Why Folder Selection

A real YNAB4 budget is a package/folder structure containing `Budget.ymeta`, an active `dataXX-*` folder, and `Budget.yfull` / `Budget.json`.

The browser implementation currently expects the user to select the extracted `.ynab4` package folder. ZIP extraction is deliberately deferred.

## Drill-down Preview Requirement

A summary count is not enough to trust the importer. The preview should let the user expand the major sections and confirm that the package has been interpreted correctly.

v1.60 therefore includes drill-down previews for:

- Accounts
- Category groups and categories
- Payees
- Category and category group notes
- Scheduled transactions
- First transaction sample
- Recent transaction sample

The preview deliberately samples rather than listing every record, because real YNAB4 budgets may contain thousands of payees and tens of thousands of transactions. Full counts remain visible in the summary metrics, while drill-down sections show enough context to validate that the parser has understood the package.

Current preview caps:

- Accounts: first 20
- Category groups: first 20
- Categories within each group: first 12
- Payees: first 20
- Scheduled transactions: first 15
- Notes: first 20 category notes and first 20 group notes
- Transactions: first 10 and recent 10

## Progress Indicator Requirement

The user explicitly requested a customised progress indicator so large YNAB4 imports do not appear frozen.

The planned phases are:

1. Reading YNAB4 package
2. Validating YNAB4 metadata
3. Analysing YNAB4 budget data
4. Preparing migration preview
5. Preparing target budget
6. Importing accounts
7. Importing categories
8. Importing payees
9. Importing transactions
10. Importing scheduled transactions
11. Validating imported budget
12. Import complete

Future implementation should update this indicator during real import work, especially transaction migration because real YNAB4 budgets may contain tens of thousands of transactions.

## Safety Rules

v1.60 writes no budget data.

The Continue button is intentionally disabled. The Budget Launcher flow will create a new imported budget in a later release. Replacing the current budget remains a separate future Settings / Reset workflow and is not exposed on the launcher.
