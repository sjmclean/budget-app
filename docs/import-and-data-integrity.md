# Import and Data Integrity

Import workflows must preserve source evidence while producing clean canonical
application data.

## Import phases

An import should separate:

1. source inspection;
2. parsing;
3. normalization;
4. mapping;
5. validation;
6. matching;
7. user review where ambiguity remains;
8. staged commit;
9. post-commit verification.

## Provenance

Imported records should retain enough provenance to explain where they came
from and how source identifiers were mapped.

Raw source values that are useful for reconciliation should not be discarded
merely because the application also stores normalized values.

## Matching

Automatic matching must require meaningful identity evidence.

Amount and date alone are not sufficient to assume that unrelated transactions
or merchants represent the same entity.

Ambiguous candidates should remain reviewable rather than being silently
collapsed.

## Merchant knowledge

Explicit imported recognition rules and user-confirmed merchant knowledge are
stronger evidence than incidental historical autocomplete behaviour.

Generic substring matches must not become automatic identity without sufficient
evidence.

## Financial reconciliation

Source-calculated budget values may be compared with the application's
authoritative projection.

Differences should be explainable through canonical transactions, assignments,
policies, and source semantics.

Source-calculated totals are evidence for validation, not a permanent competing
financial engine.

## Commit integrity

Imports should be staged before becoming authoritative.

A failed commit must not leave a partially registered budget or an
unintentionally authoritative partial database.

Successful commit should publish the state required for subsequent local-first
synchronization.
