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

Automatic bank-transaction matching uses deterministic, explainable evidence.
The current thresholds are deliberately provisional: representative real-world
imports should be used for a period before they are tightened or loosened.

### Candidate and competition windows

The two date windows have different purposes:

- **candidate window: ±7 days** — only register transactions inside this window
  may represent the imported transaction;
- **local amount-competition window: ±14 days** — transactions in this wider
  window provide context about how many nearby register occurrences share the
  imported transaction's exact signed amount.

A transaction in the ±14-day competition window but outside ±7 days contributes
context only. It can never become a match candidate.

Exact signed amount is mandatory for matching. Amount uniqueness is supporting
evidence, not transaction identity.

### Merchant evidence remains authoritative

Merchant compatibility is a hard requirement for automatic matching.

Evidence is evaluated in this order:

1. explicit user recognition rule;
2. trusted canonical payee or confirmed alias identity;
3. deterministic normalized merchant identity;
4. high-confidence merchant similarity;
5. date proximity and local amount competition.

Date or amount evidence cannot override a contradictory merchant. A transaction
does not become an automatic match merely because it is the only nearby
transaction with the same amount.

### Provisional confidence score

Eligible candidates receive a deterministic score from three components:

- merchant evidence: **70%**;
- date proximity: **20%**;
- local exact-amount competition: **10%**.

The current date scores are:

| Days apart | Score |
| ---: | ---: |
| 0 | 100 |
| 1 | 95 |
| 2 | 90 |
| 3 | 85 |
| 4 | 70 |
| 5 | 60 |
| 6 | 50 |
| 7 | 40 |
| more than 7 | not a candidate |

The current local exact-amount competition scores are:

| Available same-amount occurrences within ±14 days | Score |
| ---: | ---: |
| 1 | 100 |
| 2 | 70 |
| 3 | 40 |
| 4 or more | 0 |

An automatic match currently requires:

- exact signed amount;
- a date inside the ±7-day candidate window;
- compatible merchant evidence;
- a confidence score of at least **80/100**; and
- when another credible candidate exists, a winning margin of at least
  **10 points** over the next candidate.

The winner margin matters particularly for recurring fixed amounts. For example,
three nearby `$25` transactions from the same merchant are not made unique by
their amount. The closest date receives more weight, but two nearly adjacent
occurrences remain reviewable when their scores are too close.

### Tuning policy

These values are not claims of universal banking behaviour. They are the first
conservative production heuristic and must be tuned from observed imports.

When adjusting thresholds:

- preserve exact signed amount as mandatory;
- do not allow local amount uniqueness to override merchant contradiction;
- prefer false negatives that remain reviewable over silent false-positive
  matches;
- add a regression representing the real transaction pattern before changing a
  threshold;
- keep transfer reconciliation separate from ordinary merchant matching; and
- do not introduce AI or broader fuzzy matching merely to make an isolated
  example pass.

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
