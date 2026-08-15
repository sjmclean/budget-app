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

Identity strength is explicit at the import boundary:

- OFX/QFX `FITID` is a strong bank-provided external identity when present;
- CSV is strong only for deliberately recognised transaction-ID headers
  (`FITID`, `Transaction ID`, `TransactionId`, or
  `Bank Transaction ID`);
- QIF has no standard stable transaction ID and therefore always uses fallback
  identity;
- generic CSV values such as `ID`, `Unique ID`, row number, sequence,
  filename, import timestamp, and array position are never treated as strong
  transaction identity.

A repeated strong external ID is suppressible occurrence-for-occurrence. Known
conflicting strong external IDs associated with the same deterministic source
transaction must remain distinct: identical date, amount, payee, and memo do
not override that transaction-specific conflict.

Older retained register data may predate external-ID history entirely. Its
retained source fields may still recover a later strong-ID import
conservatively. The existence of unrelated strong-ID history elsewhere in the
same account does not prove a conflict for that legacy occurrence. New strong
imports retain an internal association between external identity and the
existing deterministic fallback identity so later conflicts can be recognised
without changing the transaction or SQLite schema. Fingerprints created before
this association was introduced cannot prove a transaction-specific external-ID
conflict retrospectively; they therefore retain the conservative legacy
recovery behavior until stronger transaction-specific evidence is recorded.

Missing external identity is not itself a conflict. Such rows continue through
the conservative fallback and occurrence-aware retained-register workflow.

Identity remains qualified by source format. The importer does not claim that
an OFX `FITID` and a CSV transaction-ID value are equivalent merely because
their text happens to match. Cross-format deduplication requires an explicit
future identity mapping rather than silent inference.

These rules apply to supported bank-import formats such as QIF, CSV, OFX, and
QFX. Exact duplicate-file detection remains a separate mechanism.

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


## YNAB4 imported payee provenance

Historical YNAB4 `importedPayee` values are preserved as Budget App's raw bank
payee provenance. The normal mapped, user-facing payee is unchanged. Meaningful
source text is trimmed; absent or blank source values do not invent provenance.
Provenance expectations apply only to the canonical active transaction set.
YNAB4 tombstones do not produce destination transactions, so they do not
produce provenance expectations. This does not weaken validation: every active
transaction with meaningful `importedPayee` text must resolve to a destination
account and preserve that text exactly.

Staged validation reports unresolved destination-account assignment separately
from a missing destination transaction. When a destination exists it also
distinguishes a null `rawPayeeName` from a differing value. Account-scoped
batch reads remain the successful path; an individual lookup is used only to
diagnose a missing account-scoped result.

Retaining this bank description lets later QIF, CSV, and OFX imports recognise
transactions that were already represented by the YNAB4 migration. Matching
remains conservative and occurrence-aware: one retained register occurrence
can account for only one incoming occurrence, so an additional genuine
identical transaction remains available for review.

YNAB4 entity/`YNABID` values remain migration and source identity. They are not
treated as bank external transaction IDs. Richer generic source provenance,
`ImportRun`, and `ImportMap` modelling remains follow-up work.

### Why earlier green tests missed this

Earlier coverage proved ordinary transaction mapping, persisted financial
totals, and later bank-import overlap behavior independently. It did not prove
that `importedPayee` survived YNAB4 mapping, crossed the SQLite import DTO,
reached the local-first transaction record, and then supplied evidence to
overlap recovery. Focused mapper, conversion, persistence, provenance-audit,
and end-to-end overlap tests now close those boundaries.


### YNAB4 migrated bank-provenance bridge

YNAB4 transactions that contain meaningful `importedPayee` are persisted with
`raw_payee_name` and the explicit transaction provenance
`ynab4-imported-payee`. A later QIF or CSV import may use that evidence to
consume one destination-account/date/amount/raw-payee occurrence even when the
user changed or cleared the transaction memo after migration.

This bridge is deliberately unavailable to ordinary manual transactions,
including manual rows that happen to contain raw-payee text. It does not invent
a QIF fingerprint, CSV transaction ID, or OFX FITID. A register occurrence can
be consumed only once, so an additional same-value bank occurrence remains in
review.

### Complete bounded matching reads

Transaction import matching first parses the candidate dates without making
duplicate decisions, then reads only the selected destination account across
the statement interval plus the reconciliation engine's seven-day window on
both sides. That read uses pages of at most 250 rows and follows continuation
cursors until the bounded range is complete; it never substitutes a larger
arbitrary cap. Account identity and inclusive date bounds are forwarded to
every page query. The initial upload and merchant-learning bootstrap remain a
single bounded sample and are not used as the authoritative duplicate set.

The memo-independent YNAB4 migration bridge is enabled only for incoming QIF
and CSV files, because YNAB4 retained the bank payee but not the originating
file format. OFX/QFX continues to respect FITID precedence and cannot be
collapsed through this compatibility bridge.
