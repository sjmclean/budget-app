# Search and Indexing

Search grew from simple in-memory filtering to database-backed filters and indexes in v1.2.12.

## Search use cases

- Transaction register search.
- Filter by account, category, payee, flag, tag, cleared/reconciled status.
- Date and amount ranges.
- Import matching/deduplication.
- Payee cleanup and auto-categorisation.

## Current approach

The backend includes database-backed search services and performance index helpers. The UI should call application services rather than composing raw SQL itself.

## Pagination and sorting

Large budgets should never load all transactions into the UI. Register screens should use:

- Limit/offset or cursor pagination.
- Stable sorting.
- Indexed filters.
- Separate count queries only when needed.

## Future FTS5

SQLite FTS5 may be useful later for memo/payee/notes full-text search. It should be added only after normal indexed search is insufficient, because FTS tables add migration and sync complexity.
