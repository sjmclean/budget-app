# Local-first SQLite architecture

## Decision

Each device will own a complete SQLite budget. UI reads and writes will execute
against that database in a dedicated worker. The remote service will authenticate
users, enforce budget membership, and relay opaque baselines and mutations.

Hosted query endpoints are transitional and must not be added to new budget
domains.

## Invariants

1. One budget has one active sync epoch.
2. A device with a different epoch is stale and must rebuild from a complete
   baseline. It must never silently adopt the new epoch.
3. Every canonical write and its outbox mutation commit in one SQLite
   transaction.
4. A baseline is complete only when its manifest covers accounts, transactions,
   payees, categories, budget months, scheduled transactions, and transaction
   tags.
5. Sync status must distinguish local durability, baseline readiness, pending
   mutations, and remote acknowledgement.
6. An in-memory SQLite fallback is never described as durable or offline-ready.
7. The server must not require knowledge of budget-domain fields. This preserves
   the seam for future end-to-end encryption.

## Physical browser storage

The browser runtime uses the official SQLite WASM package in a module worker and
opens an OPFS database. It prefers the concurrent `opfs` VFS and falls back to
the durable `opfs-sahpool` VFS when SharedArrayBuffer-backed OPFS is unavailable,
as can occur on Safari and non-cross-origin-isolated deployments. The fallback
is deliberately single-worker and persistent; the app never substitutes an
in-memory database. Development, preview, and production responses should send:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If persistent SQLite cannot be opened, budget access stops with an actionable
capability error. Falling back to transient memory would create silent data loss.

## Transactional outbox

Canonical entity changes and their mutation envelopes share the same SQLite
transaction. A mutation is acknowledged only after the relay durably accepts it.
The local row may be compacted after a complete baseline has been accepted.

## Import

The YNAB4 streaming reader remains the source layer. Its bounded batches will be
written into a staged local SQLite database. Validation runs against that
database, activation changes one local pointer, and the activated database is
published as a compact baseline.

## Cutover sequence

1. Durable worker, complete manifest, and transactional outbox. **Complete.**
2. Relational account/register engine with bounded queries and atomic
   register/outbox writes. **Complete, activation gated.**
3. Baseline upload/download relay and explicit sync epochs. **Complete.**
4. Bounded SQLite baseline materialisation and integrity-checked local
   activation. **Complete.**
5. Direct staged YNAB4-to-local-SQLite import, complete-domain validation,
   atomic activation, and initial relay baseline publication. **Complete.**
6. Account/register runtime adapter activation after the complete baseline is
   verified. **Complete.**
7. Budget months, categories, payees, schedules, tags, and account navigation
   cutover. **Complete.**
8. Dashboard and reports cutover with indexed aggregates and bounded
   drilldowns. **Complete.**
9. Remove hosted budget data queries from the local-first runtime and disable
   browser-key replication so exactly one sync protocol is active. **Complete.**
   Local export, restore, reset, and deletion now use the browser SQLite engine
   and local-first relay; no hosted budget lifecycle or domain endpoint remains.
10. Persist pulled cursors atomically with remote mutations and compact
    acknowledged outbox rows. Replacement baselines carry their exact mutation
    cursor; activating one prunes only the server mutations included in that
    verified baseline. Devices behind the retained cursor rebuild from the
    active baseline, and concurrent stale baseline commits are rejected.
    **Complete.**
11. Coordinate tabs with an exclusive per-budget Web Lock while draining the
    outbox and applying remote mutations. Leadership is operation-scoped so a
    suspended background tab cannot indefinitely block the foreground tab.
    BroadcastChannel notifies sibling tabs after shared SQLite state advances;
    browsers without these APIs retain automatic synchronization through the
    existing idempotent relay. **Complete.**
12. Detect concurrent edits using the durable cursor each mutation observed.
    Server order remains deterministic, the winning mutation identifies the
    mutation it superseded, and only the losing device persists an actionable
    conflict. Settings exposes **Accept remote** and **Keep mine**; keeping the
    local value emits a new ordinary mutation based on the current cursor.
    Conflict records commit atomically with remote mutation application.
    **Complete.**
13. Add optional client-side encryption for baseline and mutation payloads.
14. Remove the retired hosted budget-engine implementation and its database
    tables. Schema migration 4 creates the configured pre-migration SQLite
    backup before dropping the old import, ledger, schedule, reference-data,
    and month-view tables. Authentication, budget ownership, the local-first
    relay, scoped replication history, and operational backups are preserved.
    **Complete.**
15. Reject unexplained destructive baseline replacement on both the publishing
    device and relay. Count reductions require a newer durable cursor and
    matching deletion mutations; an uninitialised or missing local SQLite file
    cannot replace a populated budget. The relay retains the active baseline
    plus one previous committed baseline as a bounded recovery point.
    **Complete.**

Development databases are intentionally reset at the final cutover. There is no
compatibility migration for pre-cutover imported budgets.
