# SQLite Restore Points

## Scope and audit

Restore Points now capture authoritative SQLite, not budget-package exports from
the metadata key/value backend. The obsolete snapshot/index/daily-marker code,
fixed 30-point cap, immediate hourly thinning, and large-import exclusion have
been removed. Previously stored packages are neither read nor migrated. Normal
downloadable SQLite Backup/Restore remains separate; its existing replacement
algorithm is unchanged, with a before-restore safety capture added at its boundary.

The audit covered the worker/client export and replacement contracts, durable
physical-generation promotion, the query ownership proxy, mutation notifications,
staged YNAB4/Actual imports, switch/reset/delete entry points, and relay baseline
publication. Reusing normal restore was unsafe: it promotes locally before relay
publication, and ordinary baseline publication correctly rejects unexplained
reductions. Internal restore therefore has an explicit staged epoch transition.

## Responsibilities

- `restorePointTypes.ts`: metadata, reasons and semantic labels.
- `restorePointRetention.ts`: deterministic, budget-isolated UTC time buckets.
- `restorePointStore.ts`: OPFS payloads, integrity checks, metadata publication and pruning.
- `restorePointCoordinator.ts`: dirty mutation counts, coalescing and due eligibility.
- `restorePointLifecycle.ts`: one mutation subscription, 30-second heartbeat and focus/visibility reevaluation.
- `restorePointReplacement.ts`: durable replacement intent and interrupted-commit recovery.

## Capture and durability

The query ownership queue admits a timed capture without releasing its SQLite
lease. The worker serializes requests and holds a SQLite `BEGIN IMMEDIATE` lock
while reading the snapshot; this also excludes another native OPFS writer.
It runs `quick_check`, records the manifest, completes a unique `.sqlite3` file
under `budget-app-sqlite-restore-points`, and reads it back to verify its SQLite
header, page-aligned length and SHA-256 digest. Only then does it atomically close
the corresponding lightweight `.json` manifest. Empty, not-yet-published OPFS
manifest handles are not catalogue entries. Payloads never enter key/value storage.

After publication, timed retention removes each obsolete manifest before its
payload. Cleanup failures cannot invalidate the new checkpoint. Files left by
interruption or failed physical pruning may consume space; no broad orphan sweep
risks deleting a live capture. Files and manifests live outside budget KV cleanup
and outside the active physical-generation pool, including before-delete points.

Native rollback-journal OPFS capture reads/writes in 4 MiB chunks. SAH-pool's
installed `exportFile` API returns one full database-sized byte array; capture
keeps that allocation in the worker and streams it to ordinary OPFS. A WAL-mode
database uses SQLite serialization so uncheckpointed WAL pages are included;
the exported header is marked as a standalone rollback-journal database.
Serialization has additional WASM memory cost. No automatic path creates a
download Blob or serializes domain data through JSON. Large imports are not skipped.

## Scheduling and retention

Successful SQLite mutation notifications are the only live dirty signal. Dirty
state and mutation counts are transient. Mutations coalesce for about ten minutes;
an unchanged budget creates no timed points. A throttled/sleeping tab produces at
most one overdue point when evaluated again, never fabricated historical points.
Capture failure leaves it dirty. Restarted applications also protect changes at
the switch boundary by comparing the actual SQLite epoch/revision with the latest
persisted checkpoint, even when transient mutation tracking was lost.

Timed points retain 10-minute buckets for six hours, hourly buckets until one day,
daily buckets until seven days, Monday-anchored weekly buckets until five weeks,
and calendar months thereafter. Event/manual points are not bucket-thinned.
An equivalent reason + epoch + revision reuses its existing point. Retention is
applied when a point is published; there is no normal count cap.

## Lifecycle and restore

Successful YNAB4 and Actual imports capture their initial point after full local
promotion and baseline publication, before closing the import worker. Import
entry captures an active budget when applicable. Switch capture is awaited inside
the drained ownership boundary before closing persistence; selection/navigation
follow release. Reset and delete capture before their destructive operations.
The Settings catalogue reads the new service and retains date grouping and clear
semantic labels, without the old fixed-limit language.

Internal restore first synchronises and captures a protected before-restore point.
It imports the selected, integrity-checked SQLite payload into a new physical
generation using the existing baseline replacement mechanism. The old durable
pointer and physical generation remain authoritative while staging. The candidate
has a fresh epoch, empty outbox/conflict inbox, cursor zero and the current device
identity; historical operations cannot replay over restored data.

Owner-only relay restore endpoints stage and hash-check all chunks without changing
authority. Commit transactionally compares the previous epoch, baseline and latest
cursor, then installs the new baseline/epoch and clears the old mutation stream.
Ordinary editor baseline endpoints cannot bypass destructive-baseline protection.
Concurrent changes reject the restore without overwriting them.

A durable local intent is flushed before remote commit. Only after commit is
confirmed does the client publish the new physical-generation pointer and retire
the old file through the established promotion protocol. Pre-intent failures and
certified relay rejections abort the candidate and retain the original generation.
Local storage and the relay cannot share one atomic transaction: an uncertain
post-intent outcome is explicitly **pending recovery**, not a reported successful
restore or an assumed rollback. Ownership is quarantined, including already queued
operations. Reload replays the durable intent idempotently before normal bootstrap.
Lost acknowledgements and local pointer-publication failures retain both generations
until recovery can decide safely.

## Boundaries and operational limitations

- Browser quota/eviction remains a storage limit. Safety capture failures block
  destructive operations; users still need exported backups outside this origin.
- Semantic points, deleted-budget payloads, and interrupted-upload/orphan files can
  accumulate. Before-delete files remain recoverable SQLite artifacts, but the
  active-budget Settings screen is not a deleted-budget recreation interface.
- Large SAH-pool snapshots allocate a database-sized buffer and hold the query lease
  during copy/validation. No real-device latency/quota benchmark is claimed.
- Tests execute the capture function against real SQLite, including concurrent
  writer exclusion and 30,001 transactions, with simulated OPFS handles. They do
  not substitute for testing browser-specific storage eviction or process crashes.
- Normal manual SQLite restore retains its pre-existing same-epoch implementation;
  this change does not claim to repair that separate workflow's sync limitations.
- Deploy the matching relay endpoints with the web client. An older server rejects
  staging before any active generation is changed.

## Validation and change inventory

Validated on 2026-09-03:

- All 135 unit-test files passed, including the four new focused restore-point files.
- All 11 integration-test files passed, including real SQLite capture/locking and relay epoch transitions.
- Both existing regression-test files passed.
- `pnpm test:web-build` passed TypeScript and the production Vite build.
- `pnpm docs:architecture:check` passed after regenerating the persistence inventory.
- `git diff --check` passed. The requested obsolete identifier/schema search found no matches.

Tests were discovered from the complete test directories and executed individually
with the installed `tsx` CLI. This avoids the existing Windows runner's
`spawnSync pnpm` executable-resolution issue; no tests were disabled or omitted.

Added files (13):

- `apps/web/src/features/budget/restorePointTypes.ts`
- `apps/web/src/features/budget/restorePointRetention.ts`
- `apps/web/src/features/budget/restorePointStore.ts`
- `apps/web/src/features/budget/restorePointCoordinator.ts`
- `apps/web/src/features/budget/restorePointLifecycle.ts`
- `apps/web/src/features/persistence/localFirst/restorePointReplacement.ts`
- `docs/architecture/sqlite-restore-points.md`
- `tests/unit/persistence/restore-points.test.ts`
- `tests/unit/persistence/restore-point-replacement.test.ts`
- `tests/unit/persistence/restore-point-architecture.test.ts`
- `tests/unit/persistence/restore-point-lifecycle.test.ts`
- `tests/integration/persistence/restore-point-relay.test.ts`
- `tests/integration/persistence/restore-point-worker.test.ts`

Changed files (23):

- `apps/server/src/localFirstRelayStore.mjs`
- `apps/server/src/server.mjs`
- `apps/web/src/features/budget/actualBudgetLauncherImport.ts`
- `apps/web/src/features/budget/ynab4LauncherImport.ts`
- `apps/web/src/features/persistence/accountRegisterQueryContracts.ts`
- `apps/web/src/features/persistence/budgetDatabaseLifecycle.ts`
- `apps/web/src/features/persistence/configuredPersistenceProvider.ts`
- `apps/web/src/features/persistence/localFirst/budgetDatabaseOwnership.ts`
- `apps/web/src/features/persistence/localFirst/budgetDatabaseOwnershipRouting.ts`
- `apps/web/src/features/persistence/localFirst/contracts.ts`
- `apps/web/src/features/persistence/localFirst/localBudget.worker.ts`
- `apps/web/src/features/persistence/localFirst/localBudgetClient.ts`
- `apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts`
- `apps/web/src/features/persistence/localFirst/relayTransport.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/web/src/stores/budgetRegistryStore.ts`
- `docs/architecture/README.md`
- `docs/architecture/persistence-audit-phase-1.md`
- `docs/architecture/persistence-audit.json`
- `tests/RISKS.json`
- `tests/integration/persistence/budget-launcher-database-lifecycle.test.ts`
- `tests/unit/persistence/local-first-database-lifecycle.test.ts`

The two superseded budget snapshot/lifecycle modules are deleted, not retained as
adapters. The starting commit and rollback tag remain unchanged; work is confined
to `feature/sqlite-restore-points`.
