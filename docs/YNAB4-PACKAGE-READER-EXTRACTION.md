# YNAB4 Package Reader Extraction — Step 1

## Summary

This change extracts YNAB4 package discovery, active-device selection, and `Budget.yfull` reading into shared modules without intentionally changing importer behaviour.

## Added

- `packages/ynab4-importer/src/package/discoverPackage.ts`
  - normalises package paths
  - locates and parses `Budget.ymeta`
  - determines the package root and active data folder
- `packages/ynab4-importer/src/package/selectLatestDevice.ts`
  - selects the latest device that reports full knowledge
  - centralises YNAB4 knowledge recentness calculation
- `packages/ynab4-importer/src/package/readBudget.ts`
  - reads an explicitly selected budget-data path when supplied
  - otherwise selects the active `Budget.yfull` snapshot
  - supports the existing unambiguous `Budget.json` fallback
  - validates JSON and object-root shape

## Updated consumers

- `packages/ynab4-importer/src/analyzeYnab4Package.ts`
- `apps/web/src/features/budget/ynab4LauncherImport.ts`
- `apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts`

These now use `readYnab4BudgetData()` rather than independently locating and parsing the active source file.

## Exports

`packages/ynab4-importer/src/index.ts` now exports the shared package-reader modules.

## Validation

Completed:

- isolated TypeScript compilation of the new package-reader modules and package analyser;
- runtime smoke test proving latest-complete-device selection;
- runtime smoke test proving explicit source-path selection;
- repository-wide search confirming the launcher and accuracy audit now call the shared reader.

The repository-wide `tsc -p tsconfig.json --noEmit` command still reports numerous pre-existing project errors involving extensionless ESM imports, missing dependency typings, and historical tests. No errors were reported for the new shared package-reader modules during isolated compilation.

## Behaviour deliberately retained

- Latest complete device is selected from YNAB4 device knowledge metadata.
- A single `Budget.yfull` is accepted when device metadata is absent.
- Multiple `Budget.yfull` files without usable device metadata remain ambiguous and are rejected.
- A single `Budget.json` remains supported as a legacy/synthetic fallback.
- The launcher and post-import audit continue to honour the exact source path chosen during discovery.
