# v2.43.0 Import Provider Framework & Actual Budget Inspector

## Purpose

This release starts the next importer evolution by introducing a provider registry instead of adding each format as a one-off workflow.

The importer direction is now:

1. Detect provider.
2. Inspect file.
3. Normalise into the existing import preview model when supported.
4. Reuse matching, review, aliases and batch commit.

## Providers registered

- CSV
- QIF
- OFX
- QFX
- Actual Budget

## Actual Budget scope in v2.43.0

Actual Budget support is intentionally inspection-only.

The Actual provider can identify JSON-like Actual exports and report counts for:

- accounts
- transactions
- payees
- category groups
- categories
- rules
- schedules
- notes
- attachments/files

Rules, schedules, notes and attachments/files are reported as unsupported warnings for now.

## Deliberately deferred

- committing Actual Budget imports
- mapping Actual transactions into the review screen
- schedule import
- rule import
- attachment import
- category/budget structure commit
- transfer reconciliation

## Design decision

Actual Budget should not become a separate import workflow. It should become an import provider that eventually feeds the existing review/matching/commit pipeline.
