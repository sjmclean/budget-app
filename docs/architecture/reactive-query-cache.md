# Reactive query cache

P0.5 introduces one shared, bounded cache for reusable authoritative read models.
It builds on the scoped persistence revision system from P0.3 and the committed
register-delta work from P0.4.

The cache does not become a second persistence authority. SQLite remains
authoritative and persistence events remain invalidation metadata.

## Query definition

Each cached read has one typed definition containing:

- a stable query identity;
- a complete cache key;
- the persistence interest that invalidates it;
- the authoritative loader.

For example, the budget-month query is keyed by budget and month and is
invalidated by budget/category/transaction/goal changes for that month.

## Consistency

A query load captures the matching persistence revision before and after the
underlying read. A result is published only when those revisions match. If a
relevant publication races the read, that result is discarded and the query is
retried.

Identical consumers share one in-flight Promise. Existing authoritative data is
retained while a stale entry refreshes, and refresh errors do not discard that
previous data.

Committed budget-month command readbacks carrying the executor-owned
`publicationRevision` may seed the matching cache entry directly. This avoids
an unnecessary duplicate read after the same publication. Optimistic workspace
previews are never seeded into the authoritative cache.

## Invalidation and subscriptions

Active entries subscribe to the existing persistence-change bus. There is no
second event system, polling loop, or worker-subscription mechanism.

An invalidation marks the entry stale and schedules one deduplicated refresh.
Inactive warm entries do not retain persistence subscriptions; when reused,
their stored revision is compared with the current authoritative revision before
they are served as current.

## Bounded retention

The cache retains at most 256 entries:

`MAX_REACTIVE_QUERY_CACHE_ENTRIES = 256`

Unsubscribed least-recently-used entries are evicted first. In-flight work for an
evicted entry is invalidated by generation and cannot publish into a later cache
entry.

Changing or resetting the configured persistence provider clears the whole
reactive-query cache so data from one provider/database generation cannot be
served by another.

## Migrated read models

P0.5 currently uses the shared cache for:

- budget month views;
- financial overview;
- monthly spending;
- monthly category transactions;
- account navigation;
- category activity drilldowns.

Budget-month navigation prefetches the same cache entry that the destination
screen consumes.

The account register is intentionally not migrated. Its P0.4 model owns ordered
mutation deltas, pagination, running-balance reconstruction, and bounded local
refill semantics that are more specialized than the generic read cache.

## Phase boundary

P0.5 does not change the underlying local-first read policy. Query loaders may
still synchronise before reading when their existing runtime contract requires
that behavior. Warm local-first startup and background sync remain later startup
work.

P0.5 also does not add worker query subscriptions. The existing persistence
revision bus plus shared cache is the only reactive-query mechanism.
