# Reactive persistence updates

Persistence updates use typed, scoped invalidation. The former application-wide
version counter made every subscriber re-query after every write, including
writes for another account, month, or budget.

`PersistenceChangeEvent` records the source (`local`, `replication`, or `restore`)
and a serialisable scope: budget, affected domains, and known account,
transaction, category, and month identifiers. A deliberately `broad` scope is
reserved for whole-budget restore, database generation replacement, or rebuild.
An ordinary local transaction publication can additionally carry a bounded
register delta materialised by the SQLite worker after its canonical-state and
outbox transaction commits. The executor publishes this internal metadata; the
public command facade still returns only the domain result.
Pure matching rejects different budgets and known non-matching accounts or
months, while missing entity detail is conservative. Same-source changes for one
budget are microtask-batched by unioning scope; mixed sources and budgets remain
separate.

## Granularity policy

- Routine mutations publish the narrowest safe domain/entity/month scope known
  at the commit boundary. Transaction transitions union both their old and new
  accounts, transfer accounts, categories, and months.
- Missing entity specificity is conservative within the declared domains. This
  protects correctness when a mutation format does not carry enough detail.
- Whole-budget replacement uses explicit broad invalidation only after the new
  SQLite generation becomes authoritative.

Intentional conservative classes are limited to:

- restore-point activation, reset, baseline replacement, checkpoint repair, and
  database-generation promotion, which broadly invalidate the replaced budget;
- the legacy key-value replication engine, whose operation journal contains
  storage keys but cannot reliably derive Budget App domain dependencies. It
  uses an explicitly named same-budget/all-domain helper. The local-first SQLite
  relay derives scopes from the mutations actually committed and does not use
  this fallback.

```text
ordinary register command -> local SQLite mutation + outbox commit
                          -> bounded authoritative worker delta
                          -> executor scoped publication
                          -> register incremental reconciliation

relay event -> sync -> pull mutation -> apply to local SQLite -> commit
            -> scoped replication event -> matching subscribers
```

Relay arrival schedules synchronization; it does not directly invalidate UI
state. A successful restore/generation promotion publishes broad same-budget
invalidation after the authoritative switch; a failed promotion publishes none.

The budget-month hook subscribes by budget, month, and budget/category/
transaction/goal domains. The register subscribes by budget, account, and its
row/summary domains. It consumes ordered original publications from a separate
per-budget journal capped at 256 entries, rather than relying on a coalesced
latest event. A transaction delta patches at most 250 affected roots. Larger
operations return `refresh-required` without transporting an oversized row set.
For a short loaded window, the register reads only the missing boundary rows
from the already-open SQLite database, with no relay synchronization.

Remote replication, incomplete journal history, unsupported query modes, and
cross-domain changes without a safe transaction delta cause one authoritative
register refresh. This is a correctness fallback, not a second ordinary-write
path. Search, category filtering, and non-date sorts currently use this
conservative fallback rather than approximate worker SQL semantics. P0.5 adds
a separate bounded shared cache for reusable non-register read models; the
specialized register delta/pagination path remains intentionally independent.

> SQLite is authoritative; persistence change events are invalidation metadata,
> not financial state.

They are not a canonical event log or replication protocol.

This changes neither mutation ordering nor sync epochs, cursors, conflicts,
offline writes, or convergence. Worker subscriptions and a reactive query cache
remain future work.

The explicit **Rebuild from server** recovery action may still reload after replacing the complete local database. That is intentionally separate from normal background replication.

The local-first SQLite provider is the sole normal browser runtime. Earlier
provider modes are retained only in historical design/removal records.
# Command publication ownership

Ordinary local handlers return committed metadata to the engine executor. They
do not publish directly. The executor unions all command impacts and publishes
exactly once after success. Microtask coalescing remains useful for independent
events, but it is not used to disguise multiple publications from one command.

The published `PersistenceChangeScope` tells consumers which authoritative
SQLite projections may be stale. When present, the register delta supplies the
worker's committed before/after rows and post-commit summaries for incremental
reconciliation; it is not a replacement for SQLite authority or a replication
protocol.
