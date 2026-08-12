# Application Architecture

Budget App is a local-first budgeting application.

The web application initializes its persistence runtime before loading the main
React application. Financial and register data are stored locally in SQLite and
synchronized through the local-first relay architecture.

## Runtime layers

The application is divided into several conceptual layers:

- React UI and application workflows;
- budgeting and register domain logic;
- local-first SQLite persistence;
- synchronization and replication coordination;
- server relay and authenticated hosted services.

UI code should depend on application and persistence contracts rather than
reimplementing domain or storage behaviour.

## Major application domains

### Budgeting

Owns category assignment workflows, budget views, overspending resolution, and
interaction with the authoritative financial projection engine.

### Register

Owns accounts, transactions, splits, transfers, reconciliation, scheduled
transactions, attachments, and register-facing validation.

### Import

Owns source inspection, parsing, normalization, matching, review, provenance,
and staged commit into canonical application data.

### Merchant knowledge

Owns reusable merchant identity, aliases, recognition evidence, and explicit
payee/category knowledge.

### Reporting

Consumes authoritative persisted and projected financial data. Reporting is
read-only with respect to budgeting policy.

### Persistence and synchronization

Owns local SQLite lifecycle, mutation durability, replication state, baselines,
sync epochs, relay communication, and persistence-level recovery.

## Dependency rule

Financial policy belongs in domain engines.

Persistence code stores canonical facts and derived caches but must not become
an independent financial authority.

UI code orchestrates workflows but must not duplicate persistence or financial
rules.
