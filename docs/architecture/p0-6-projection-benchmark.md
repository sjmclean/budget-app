# P0.6 budget projection benchmark and rebaseline

P0.6 measures the current SQLite-worker budget projection path after the P0.1–P0.5
architecture work and uses those measurements to decide whether the older
incremental/materialized projection design is still justified.

The answer from this baseline is **no**: do not add a second category/month
projection authority or worker-push subscription system. Keep the current
dirty-boundary suffix replay plus monthly projection cache. The measured hot
path is canonical fact reconstruction, not projection-cache output reads or
writes.

## Benchmark contract

The repeatable harness is:

```bash
pnpm benchmark:p0-6:projection
pnpm benchmark:p0-6:projection:large
```

It uses native `better-sqlite3` with the production transaction indexes and the
real `projectBudget()` engine. The deterministic fixture contains:

- 60 months;
- 80 categories, including a managed credit-card payment category;
- 8 on-budget accounts, including a credit-card account;
- assignments for every month/category;
- ordinary and split transactions;
- payment-funding credit-card semantics.

Each run measures suffix replays beginning 1, 6, 12, 24, and 60 months before
the target month. It separately records:

- SQLite account-opening-state reconstruction;
- category and assignment reads;
- transaction/split fact extraction and JSON hydration;
- pure budget-engine projection time;
- projection-cache writeback;
- warm projection-cache reads;
- total cold replay time.

For correctness, every suffix replay is compared canonically with a projection
from the full 60-month history. Array ordering is normalized by stable entity
identity before comparison because SQL ordering and fixture construction order
are not financial state.

The normal run uses 50,000 transactions for five iterations. The stress run
uses 250,000 transactions for three iterations. Timing medians are evidence, not
hard CI pass/fail thresholds; the smoke test uses only a deliberately generous
ceiling alongside exact projection correctness.

## Baseline

The following medians were captured by GitHub Actions Verify run #140 on
2026-09-20 from commit `7ea62bd2e8bad99422622d969432e084898928ab`
(Ubuntu 24.04, Node 22, native better-sqlite3).

### 50,000 transactions

| Replay | Facts | Extract | Account opening | Transaction query | Projection | Cache write | Cache read | Cold total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 month | 833 | 18.26 ms | 16.83 ms | 1.23 ms | 1.42 ms | 0.10 ms | 0.07 ms | 20.02 ms |
| 6 months | 4,998 | 23.84 ms | 15.48 ms | 6.98 ms | 5.79 ms | 0.24 ms | 0.07 ms | 30.68 ms |
| 12 months | 9,996 | 32.95 ms | 14.21 ms | 14.99 ms | 10.02 ms | 0.39 ms | 0.07 ms | 42.85 ms |
| 24 months | 19,992 | 48.20 ms | 10.65 ms | 31.03 ms | 20.03 ms | 0.72 ms | 0.07 ms | 72.72 ms |
| 60 months | 50,000 | 106.36 ms | 0.06 ms | 94.32 ms | 52.21 ms | 1.66 ms | 0.07 ms | 160.23 ms |

Full-history pure projection: **104.42 ms**.

### 250,000-transaction stress case

| Replay | Facts | Extract | Account opening | Transaction query | Projection | Cache write | Cache read | Cold total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 month | 4,166 | 128.50 ms | 120.73 ms | 6.57 ms | 5.97 ms | 0.17 ms | 0.10 ms | 134.93 ms |
| 6 months | 24,996 | 160.82 ms | 107.54 ms | 45.01 ms | 19.93 ms | 0.33 ms | 0.07 ms | 182.12 ms |
| 12 months | 49,992 | 221.16 ms | 96.55 ms | 112.84 ms | 61.12 ms | 0.43 ms | 0.07 ms | 278.21 ms |
| 24 months | 99,988 | 326.86 ms | 76.54 ms | 228.05 ms | 93.62 ms | 0.77 ms | 0.08 ms | 420.49 ms |
| 60 months | 250,000 | 712.51 ms | 0.09 ms | 645.68 ms | 236.67 ms | 1.78 ms | 0.10 ms | 946.93 ms |

Full-history pure projection: **362.25 ms**.

All measured suffixes matched the full-history target financial state,
including payment-funding credit-card behavior.

## What the measurements say

### Warm reads and projection output persistence are not the bottleneck

A warm projection-cache read is approximately 0.07–0.10 ms in both data sets.
Writing all replayed month projections costs less than 2 ms at the 60-month
stress case. Materializing more output rows or adding another UI-side projection
cache would therefore optimize the smallest part of the measured path while
adding consistency and invalidation complexity.

### Short replay is dominated by reconstructing account opening balances

At 250,000 transactions, a one-month replay spends about 121 ms of its 135 ms
cold path reconstructing account balances immediately before the replay
boundary. This work is necessary for correct credit-card payment funding, but
the current query derives it by summing historical account transactions.

If real browser profiling later shows recent-month edits are too slow, the first
candidate is a bounded month-boundary account-balance checkpoint derived from
the same canonical SQLite authority. That optimization must preserve exact
replay semantics and must not become a second financial authority.

### Long replay is dominated by transaction fact extraction

At 250,000 transactions, the 60-month replay spends about 646 ms in the SQLite
transaction query and about 65 ms hydrating split JSON, versus about 237 ms in
the pure projection engine. Any future large-history optimization should first
reduce canonical fact extraction volume or cost rather than materialize more
projection output.

Pre-aggregating category activity is not assumed safe: payment-funding depends
on chronological transaction/account/category state. Any such optimization
would require a new correctness proof and benchmark comparison.

## P0.6 rebaseline decision

P0.6 does **not** implement the older broad incremental/materialized projection
design.

Keep:

1. SQLite as the single financial authority.
2. The existing earliest-dirty-month suffix replay.
3. `projectBudget()` as the authoritative financial calculation.
4. The existing month projection cache as derived output.
5. P0.5 shared reactive-query invalidation above that persistence boundary.

Do not add:

- worker-push query subscriptions;
- category-level materialized financial state;
- a second projection event protocol;
- speculative pre-aggregation that changes payment-funding semantics;
- timing thresholds tied to one CI machine.

Re-open projection optimization only when browser/OPFS profiling demonstrates a
user-visible problem. When that happens, investigate in this order:

1. month-boundary account-balance checkpoints for short dirty replays;
2. cheaper bounded transaction/split fact extraction for long replay windows;
3. pure engine optimization only after the first two are measured;
4. output materialization only if later evidence contradicts this baseline.

## Benchmark limitations

These numbers are comparative architecture evidence from native
`better-sqlite3` on a hosted Linux runner. Browser OPFS SQLite/WASM, device
storage, CPU throttling, and real user distributions can have different absolute
latencies. P0.8 startup work and any future performance investigation should
profile the browser runtime separately rather than treating these values as UX
budgets.

The benchmark is retained in CI primarily for reproducibility, correctness, and
future comparative runs. Timing regressions should be investigated from trends,
not failed from narrow numeric thresholds.
