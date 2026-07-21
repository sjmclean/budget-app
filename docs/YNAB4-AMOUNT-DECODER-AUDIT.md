# YNAB4 Phase 1 — Amount Decoder Audit and Patch

## Scope

This patch audits and consolidates monetary-value decoding in the active `.ynab4` package flow:

- package preview (`analyzeYnab4Package.ts`)
- launcher import (`ynab4LauncherImport.ts`)
- post-import accuracy audit (`ynab4LauncherImportAccuracyAudit.ts`)

The legacy CSV importer and the orphaned direct database executor are documented but deliberately not migrated in this patch. They should be removed or handled separately rather than extending the supported runtime contract.

## Audit findings

### 1. Duplicate active decoders

The launcher had separate but identical transaction and scheduled-transaction decoders, plus separate display and milliunit parsers. The accuracy audit had another display parser. Preview logic used a different first-number fallback.

This meant import, preview and audit could interpret the same source row differently.

### 2. Outflow sign defect

Both launcher decoders accepted fallback values positionally:

```ts
transactionAmountToDisplayUnits(amount, amountMilliUnits, inflow, outflow)
```

The fallback loop returned the first numeric value without field semantics. An outflow-only source row such as `{ outflow: 25 }` was therefore decoded as `+25`, which is an inflow.

The shared decoder now applies explicit semantics:

1. signed `amount`
2. signed `amountMilliUnits / 1000`
3. positive `inflow`
4. negative `outflow`

### 3. Unit inference

The active launcher consistently treats `amount` as display units and `amountMilliUnits` as YNAB milliunits. The shared decoder preserves that contract and does not infer units from integer-versus-decimal shape.

### 4. Generic budget values are not transaction amounts

Assigned, available, opening-balance and Ready-to-Assign fields do not use inflow/outflow sign semantics. These now use `firstYnabDisplayAmount`, keeping their previous first-valid-value behaviour while sharing parsing and rounding.

### 5. Audit consistency

Transaction and split contribution calculations in the accuracy audit now use the same signed decoder as persistence. Source monthly `outflows` are also treated as negative when used as an activity fallback.

## Files changed

- Added `packages/ynab4-importer/src/money/decodeYnabAmount.ts`
- Added `tests/suites/ynab4/amounts.test.ts`
- Updated `packages/ynab4-importer/src/analyzeYnab4Package.ts`
- Updated `packages/ynab4-importer/src/index.ts`
- Updated `apps/web/src/features/budget/ynab4LauncherImport.ts`
- Updated `apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts`

## Behavioural change

This is mostly consolidation, with one intentional correctness fix:

- outflow-only transaction, split and scheduled rows now decode to negative values;
- the accuracy audit uses the same sign rule;
- explicit signed amounts and milliunit amounts retain precedence;
- generic monthly-budget fields retain their previous unsigned/explicit-source behaviour.

## Validation performed

- `git diff --check`
- TypeScript compilation of the changed active modules using bundler resolution
- isolated compilation of the shared decoder
- runtime smoke assertions for display values, milliunits, inflow, outflow and formatted strings

The repository archive does not contain installed dependencies, so the complete project and feature suites were not executed here.

## Next patches

1. Extract transfer validation/resolution into a focused module.
2. Extract scheduled-transaction recurrence and mapping into a focused module.
3. Remove or formally retire the orphaned direct database executor and old amount heuristics.
