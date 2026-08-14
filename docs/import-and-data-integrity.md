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

## Overlapping bank files

Bank statement files may overlap in date range. Previously processed bank rows
should not require repeated user review when the application can prove that the
same source transaction is already represented in the destination account.

Cross-file suppression uses multiple levels of evidence:

- a stable bank-provided external transaction identifier is strong evidence of
  the same source transaction across files;
- otherwise, an existing register transaction with the same retained bank
  payee, date, amount, and source memo can represent an overlapping row;
- when a transaction was originally matched to a manual register entry whose
  user memo differs from the bank memo, prior successfully committed source
  identity evidence may be combined with the register transaction's retained
  bank payee, date, and amount.

Fallback source fingerprints must not silently suppress transactions by
themselves. A corresponding retained bank-linked register occurrence must also
exist.

Overlap handling is occurrence-aware. If two identical bank transactions have
already been represented, at most two matching occurrences in a later
overlapping file may be excluded. Additional identical occurrences remain in
the normal matching and review workflow.

A successful match to a manually entered transaction may retain the bank's raw
payee description when none was previously stored. This provenance update must
not replace the user's display payee or memo, and existing retained raw payee
data must not be overwritten.

These rules apply to supported bank-import formats such as QIF and CSV. Exact
duplicate-file detection remains a separate mechanism.

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
