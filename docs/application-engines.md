# Application Engine Boundaries

## Purpose

This document defines the major application engines, what each engine owns, and the boundaries between them. It is an architectural guide rather than a description of every current file.

The primary rule is:

> Each engine owns one kind of business responsibility. Other engines may consume its output, but should not duplicate its policy or persistence model.

## Engine map

```text
User Interfaces
    |
    v
Application Workflows
    |
    +----------------------+----------------------+----------------------+
    |                      |                      |                      |
    v                      v                      v                      v
Budget Engine       Register Engine       Import Engine       Reporting Engine
                           |                      |
                           +----------+-----------+
                                      |
                                      v
                         Merchant Knowledge Engine

Shared infrastructure:
- Sync and Storage Engine

Future shared engines:
- Planning Engine
```

This diagram shows responsibility, not a mandatory runtime call sequence. For example, the Import Engine commits through Register workflows, while both import and register editing can contribute evidence to Merchant Knowledge.

## Budget Engine

### Owns

- Envelope-budget calculations.
- Category-group and category budget state.
- Ready to Assign.
- Rollover behaviour.
- Overspending and overbudgeting rules.
- Credit-card payment budgeting behaviour.
- Targets and goals where they affect budget calculations.

### Does not own

- Register persistence or transaction editing UX.
- Import-file interpretation.
- Merchant identity and aliases.
- Report presentation.
- Cloud transport or conflict resolution.

### Consumers

- Budget screens.
- Register-derived budget activity.
- Reporting and planning workflows.

## Register Engine

### Owns

- Accounts and register transactions.
- Transaction creation, editing, deletion, and validation.
- Splits and transfers.
- Cleared and reconciled state.
- Attachments and transaction metadata.
- Payee/category values stored on a transaction.
- Bulk register operations and register-level undo/redo.

### Does not own

- Parsing bank files.
- Merchant alias learning or preferred merchant identity.
- Budget calculations.
- Import-session review state.

### Boundary rule

The register remains the source of truth for committed transactions. Import workflows prepare valid register commands; they must not bypass register validation or persistence boundaries.

## Import Engine

### Owns

The import pipeline:

```text
Inspect
  -> Interpret / Configure
  -> Parse
  -> Validate
  -> Match
  -> Review session
  -> Commit mapping
  -> Register workflow
```

Current format-specific modules are separated into inspection, parser, validator, and commit responsibilities.

The Import Engine also owns:

- File-type detection.
- QIF, CSV, OFX, and QFX interpretation.
- Account-scoped import knowledge for ambiguous file settings.
- Exact-file fingerprint checks.
- Candidate matching and neutral review information.
- The pending/processed import-session worklist.
- Import-wide policy such as whether memos are retained.

### Does not own

- Canonical merchant identity.
- Historical register cleanup policy.
- Category budgeting policy.
- Direct persistence that bypasses the Register Engine.

### Boundary rule

The Import Engine may ask Merchant Knowledge how a payee should be normalised or which category is most strongly supported. It should record evidence after confirmed user actions, but Merchant Knowledge owns that evidence and its derivation rules.

## Merchant Knowledge Engine

### Owns

- Canonical merchant identity.
- Preferred merchant names.
- Imported/raw aliases.
- Objective usage evidence for categories, accounts, and transfer accounts.
- First-seen, last-seen, and occurrence information.
- Derived preferred category and transfer candidates.
- Future merchant merge relationships.

### Does not own

- Historical transaction category rewrites.
- Import-file parsing.
- Register persistence.
- Stored confidence percentages.
- A user-facing management screen as a requirement of the engine.

### Boundary rule

Merchant Knowledge stores evidence, not confidence scores or opaque recommendations. Consumers derive behaviour from occurrence counts and recency.

See [Merchant Knowledge](merchant-knowledge.md) for the detailed model and learning rules.

## Reporting Engine

### Owns

- Read models and aggregations for dashboards and reports.
- Net worth, income/expense, spending, category, merchant, and trend reporting.
- Consistent report definitions.

### Does not own

- Mutating register or budget data.
- Merchant identity resolution rules.
- Import matching.

### Boundary rule

Reports consume canonical register and budget data. Where merchant-level reporting is required, reports should use Merchant Knowledge identity rather than inventing separate payee-normalisation logic.

## Planning Engine (future)

### Expected ownership

- Forecasting and future cash-flow scenarios.
- Planned transactions and longer-term projections.
- Scenario comparison.
- Planning-specific read models.

It should consume Budget and Register data without changing their historical truth.

## Sync and Storage Engine

### Owns

- Local-first SQLite persistence and database lifecycle.
- Per-budget synchronization epochs.
- Durable mutation outbox state and replication cursors.
- Baseline publication, download, validation, and replacement.
- Local-first relay transport and synchronization coordination.
- Cross-tab/device coordination required to preserve persistence integrity.
- Backup, recovery, and persistence-level integrity safeguards.

### Does not own

- Budgeting policy or derived financial calculations.
- Register validation or transaction business rules.
- Merchant learning.
- Import interpretation.

## Cross-engine workflows

### Bank import

```text
Import Engine
  -> Merchant Knowledge lookup
  -> Import review session
  -> Commit mapping
  -> Register Engine
  -> Merchant Knowledge evidence update
  -> Budget Engine and reports observe committed register data
```

### Manual transaction entry

```text
Register UI
  -> Merchant Knowledge lookup
  -> Register Engine commit
  -> Merchant Knowledge evidence update
  -> Budget Engine recalculation
```

### Payee rename and cleanup

```text
User renames a payee
  -> Merchant Knowledge updates canonical identity / alias evidence
  -> User may explicitly approve historical Register cleanup
  -> Future entry and imports use the preferred merchant name
```

Category history is different from merchant identity: changing a category should improve future evidence, but should not automatically rewrite historical categories.

## Shared architectural rules

1. **Register is the transaction source of truth.**
2. **Budget Engine owns budget mathematics.**
3. **Import Engine owns temporary import interpretation and review state.**
4. **Merchant Knowledge owns identity and usage evidence.**
5. **Reports read; they do not mutate.**
6. **Store facts, not confidence scores.**
7. **Do not duplicate normalisation or matching policy across engines.**
8. **User-facing labels may say “Payee”; internal identity may be modelled as “Merchant”.**
9. **Historical identity cleanup requires an explicit user decision.**
10. **Historical category decisions are not rewritten automatically.**
