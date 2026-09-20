# P0.8 warm startup and multi-tab ownership

P0.8 removes relay latency from ordinary reads when a valid local SQLite
generation is already published, and gives the single physical OPFS/SQLite
runtime explicit cross-tab ownership.

## Warm startup

A budget may use the warm path only when all of the following are true:

- a cached sync epoch exists;
- the durable physical database-file pointer is published;
- no restore-publication journal is pending;
- opening the SQLite file succeeds for the cached epoch;
- the local sync state contains a baseline hash.

When those conditions hold, ordinary reads open and read authoritative local
SQLite immediately. They do not await relay bootstrap, health checks, mutation
pushes, or mutation pulls.

If there is no published local generation, startup uses the relay/bootstrap
path. If the relay is unavailable, a cached epoch alone is not sufficient:
offline opening still requires the published physical database pointer.
Pending restore publication always takes precedence over the warm path.

Remote convergence is owned by the replication background service through the
explicit infrastructure-only `synchroniseLocalBudget` method. Ordinary reads
never start an unowned fire-and-forget synchronization task.

A remote generation change may therefore be discovered after local UI is
already usable. Generation safety remains fail-safe: if the old generation has
unsynced local changes, automatic rebuild is refused instead of discarding
those changes.

## Cross-tab SQLite ownership

The physical OPFS/SAH-pool runtime has one global browser-tab lease, independent
of budget ID.

- A long-lived exclusive Web Lock proves physical ownership.
- BroadcastChannel asks an existing owner to drain/release promptly.
- The next tab proceeds only after the Web Lock is actually released.
- Different budgets still compete for the same physical lease.
- Failed database close/release retains the Web Lock and blocks takeover.
- Hidden tabs and pagehide proactively release their lease before browser
  suspension can prevent a later handoff request from being processed, while
  preserving the mounted workspace's active-budget intent.
- A lease being released is not usable ownership: it is hidden from background
  budget scope and same-budget reacquisition waits for a fresh Web Lock.
- Pending acquisition requests are generation-scoped: hiding, releasing, or a
  newer budget activation invalidates an older queued Web Lock request before
  it can publish ownership.
- Concurrent same-budget activation requests coalesce instead of invalidating
  one another.
- A visible/focused tab reacquires its selected budget lease. If the user
  interacts with an SQLite-backed register before the lifecycle event finishes,
  that foreground operation awaits the same legitimate reacquisition barrier
  rather than failing against a released in-tab ownership gate.
- Explicit launcher/switch-budget release clears active-budget intent, so a
  released workspace is never silently reopened outside its lifecycle.
- Activation nudges the existing replication background service after lease
  acquisition; the route itself does not wait for relay convergence.

The tab's usable budget lease, not the shared selected-budget browser-storage
preference, is the source of truth for local-first replication and timed
restore-point scope. Synthetic exclusive-operation scopes are physical-lock
details only and are never exposed as budget identity. This allows different
tabs to retain different in-memory navigation selections
without causing one tab's background service to synchronize the other tab's
selection.

## Serialization

The existing per-runtime `createBudgetDatabaseOwnership` queue remains the
in-tab admission/serialization boundary.

Cross-tab ownership is an outer physical-resource lease only. It does not
replace command serialization, the command executor, publication ordering, or
the P0.4 register reconciliation model.

Explicit background synchronization enters through the normal ownership proxy,
so relay application/rebuild cannot overlap an admitted ordinary command.

## Lifecycle

- Route activation acquires the cross-tab lease and admits the budget.
- Switching to the launcher releases/drains local ownership.
- Hidden tabs flush pending provider writes and release the database lease
  without discarding the still-mounted workspace's active-budget intent.
- Visible/focused tabs reacquire the selected budget; register reads and
  mutations share that readiness barrier so immediate foreground interaction
  cannot race the asynchronous lifecycle event.
- Exclusive import/restore workflows capture any required safety restore point
  while the active budget lease is still valid, then switch to a synthetic
  exclusive physical lease that is never exposed as background budget identity,
  and release it afterward.
- Browser Web Lock ownership applies only to the local-first relay runtime;
  host-provided persistence keeps its own lifecycle contract.

## Preserved architecture

P0.8 does not add another SQLite worker, persistence authority, query event bus,
or command path. SQLite/OPFS remains authoritative locally; the relay remains
the convergence/control plane.
