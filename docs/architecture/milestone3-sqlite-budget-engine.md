# Milestone 3: SQLite budget-engine foundation

## Status

This phase establishes the bounded SQLite account-register query boundary and
the hosted HTTP transport. It does not switch a legacy browser budget to SQLite
until an importer or migration activates a complete SQLite generation.

The repository already contains a normalized SQLite schema and native
`better-sqlite3` facilities. Milestone 3 reuses that schema instead of creating a
second database model.

## Delivered in this phase

- a transport-neutral `AccountRegisterQueryPort`;
- a hard maximum of 250 transactions per query;
- cursor/keyset pagination ordered by `(date, id)`;
- an SQLite implementation using prepared statements;
- database-side account balances and transaction counts;
- partial covering indexes for active account reads and balance aggregation;
- a 100,000-row scale contract that checks pagination, bounds, query-plan index
  use, and first-page latency;
- stable package scripts for focused verification.
- hosted budget status, account summary, and bounded transaction endpoints;
- a browser-safe HTTP client installed on the persistence provider;
- an explicit `staging`/`active`/`retired` generation boundary.

## Runtime boundary

```text
React account screen (cutover consumer)
        |
AccountRegisterQueryPort
        |
hosted HTTP client
        |
SqliteAccountRegisterQueryService
        |
normalized SQLite budget
```

The web application must not import `SqliteAccountRegisterQueryService` or
`better-sqlite3`. It may import the query port and data-transfer types.

## Why the UI is not switched in this phase

The current live browser budget remains in IndexedDB key/value records. Pointing
the account screen at the SQLite service before a worker or server transport and
a verified migration/cutover path exist would create two competing sources of
truth.

The next phase must:

1. complete targeted SQLite write commands;
2. add split-line, tag, and attachment persistence;
3. move sidebar aggregates to SQLite;
4. retain the legacy provider only as an explicit fallback for unmigrated
   budgets.

## YNAB4 SQLite cutover

The browser launcher now selects the hosted SQLite destination by default.
Reference collections are mapped once, transaction source batches are mapped
to bounded canonical rows, and each batch is released after the server accepts
it.

The server:

1. creates an isolated staging generation;
2. stores reference data and transaction batches;
3. validates account and transfer-account relationships in SQLite;
4. leaves the previous live budget untouched while staging;
5. retains the validated generation rows as canonical data;
6. activates the generation by updating one pointer inside a SQLite
   transaction;
7. deletes uncommitted generation rows on cancellation.

Activation never copies transaction rows into the legacy table. Previously
activated generations are eligible for deferred bounded cleanup after the new
generation is live; cleanup is not part of the user-visible finalisation path.
Budgets imported by the earlier copy-based implementation remain readable
through a compatibility fallback.

Account and transfer-account relationships are checked as each bounded
transaction batch arrives. Import session row counts are updated in the same
SQLite transaction as the batch. Final validation therefore reads one session
row instead of rescanning the complete ledger several times.

The browser retains the small compatibility collections required by screens
that have not moved to SQLite. It does not write imported transaction entities
to IndexedDB.

## Capability-based cutover

Generation state and feature availability are separate concerns. Older
generations may be active without containing the month rows introduced by a
later slice. The status contract therefore advertises:

- `accountRegisters`: bounded account reads and targeted ledger writes;
- `budgetMonths`: hosted month views and assignment writes;
- `analytics`: dashboard and report aggregates, requiring both of the above.

Consumers route by these capabilities instead of interpreting an HTTP 404 as a
migration signal. This keeps partially migrated budgets readable and prevents
an active-but-incomplete generation from selecting a query it cannot satisfy.

The remaining browser compatibility collections are intentional:

- the budget registry and preferences;
- scheduled transactions and their generation metadata;
- payee/category administration that has not yet received hosted commands;
- import diagnostics and rollback metadata.

They must be removed only when their corresponding write commands and backup
contracts move to SQLite. Account transaction collections and large-ledger
analytics are no longer valid browser compatibility responsibilities.

Compatibility records are rendered into an isolated in-memory capture and
committed through one `applyMutations` call. Category identity records are
rendered once from the final imported month rather than rewritten for every
historical month. This prevents thousands of serialized IndexedDB transactions
from extending the finalisation phase.

The account register checks the generation status. Active SQLite budgets fetch
150 rows initially and request subsequent cursor pages only when navigation
needs them. SQLite-imported budgets are temporarily read-only in the account
screen until the targeted write-command slice is installed.

## Query invariants

- `limit` is required.
- `limit` must be between 1 and 250.
- a page reads at most `limit + 1` database rows.
- page continuation uses a `(date, id)` cursor, not an increasing offset.
- deleted transactions are excluded in the indexed predicate.
- a query is scoped by both budget and account.
- summaries are calculated in SQLite and return no transaction collection.

## Verification

```bash
pnpm test:milestone3:sqlite-account-query
pnpm test:milestone3:hosted-sqlite-transport
pnpm test:milestone3:hosted-account-client
pnpm test:milestone3:sqlite-staged-import
pnpm verify:milestone3:sqlite-foundation
```

Increase the scale fixture when required:

```bash
SQLITE_ACCOUNT_QUERY_FIXTURE_ROWS=1000000 \
  pnpm test:milestone3:sqlite-account-query
```
