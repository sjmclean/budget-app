# Payee management redesign

## Audit summary

The active runtime is the browser local-first SQLite adapter, not the older package-level
Drizzle repositories. Before this change `local_payees` stored only an ID, copied name,
note and archive flag. Transactions referenced a payee ID but also stored a denormalised
display name. Scheduled transactions stored the same pair inside `payload_json`.
The old page performed merge orchestration in React: it changed transactions first and
scheduled transactions in a later operation. Local payee counts were hard-coded to zero.
Aliases and import rules existed in two unrelated browser stores and were dropped by the
local SQLite adapter. The reviewed import candidate retained the bank description, but
the committed register command discarded it. The operation outbox records mutations,
but cannot restore a deleted multi-entity merge snapshot.

## Chosen model

- Canonical payees remain ID-based.
- `raw_payee_name` is immutable source evidence; `payee_name` remains the projected
  canonical display name.
- Exact aliases and deterministic recognition rules are separate normalized tables.
- Alias > equals rule > starts/ends rule > contains rule. Equal-precedence matches are
  reported as ambiguous instead of guessed.
- Default category is canonical payee metadata and applies only to future recognition.
- Merge is atomic in the SQLite worker across transactions, schedules, aliases, rules,
  history and source deletion.
- Rename updates copied transaction display names because the current model cannot safely
  support a separate historical display override. The unsupported "canonical only" choice
  is intentionally not exposed.
- Merge is explicitly non-undoable until the journal supports aggregate before-images.

## Migration

Opening an existing budget adds nullable payee metadata and raw-description columns.
New normalized tables are created idempotently. Existing payee IDs and transaction links
are unchanged. Old transactions have a null raw description because that evidence was not
previously persisted; future imports preserve it.
