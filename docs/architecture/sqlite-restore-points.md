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
under `budget-app-sqlite-restore-points/<encoded-budget-id>/`, and reads it back to verify its SQLite
header, page-aligned length and SHA-256 digest. Only then does it atomically close
the corresponding lightweight `.json` manifest. Empty, not-yet-published OPFS
manifest handles are not catalogue entries. Payloads never enter key/value storage.

Each budget has its own catalogue and payload directory. The directory name is
`budget-` followed by four lowercase hexadecimal digits per UTF-16 code unit of
the budget ID. This deterministic, injective encoding contains no separators or
dot segments and does not normalize distinct Unicode IDs. Listing enumerates only
that budget's child directory; capture, restore reads and pruning use the same
budget-scoped adapter. No flat-directory migration or fallback exists.
Malformed/unreadable manifests fail that budget's catalogue, never another's.
Nonempty manifests must have valid metadata, match their filename and name the
requested budget. Payload names are derived only from validated restore-point IDs.

After publication, timed/event retention removes each obsolete manifest before its
payload. Cleanup failures cannot invalidate the new checkpoint. Files left by
interruption or failed physical pruning may consume space; no broad orphan sweep
risks deleting a live capture. Files and manifests live outside budget KV cleanup
and outside the active physical-generation pool.

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
and calendar months thereafter. Ordinary safety events (switch, import, reset and
restore) use independent buckets: keep all for the first 24 hours, then the latest
per UTC day until seven days, per Monday-anchored week until five weeks, and per
UTC calendar month thereafter. Age thresholds enter the older tier at exactly
6 hours / 24 hours / 7 days / 35 days as applicable. Tier keys are separate.
Timed points and safety events never consume each other's buckets, and budgets
never compete. Newest timestamp wins, with descending ID as a deterministic tie-break.
Manual and initial-import points are protected from automatic bucket thinning;
they are long-lived independently of both rolling classes.
An equivalent reason + epoch + revision reuses its existing point. Retention is
applied when a point is published; there is no normal count cap.

## Lifecycle and restore

Successful YNAB4 and Actual imports capture their initial point after full local
promotion and baseline publication, before closing the import worker. Import
entry captures an active budget when applicable. Switch capture is awaited inside
the drained ownership boundary before closing persistence; selection/navigation
follow release. Reset captures before its destructive operation. Budget deletion
does not capture a restore point, including at the target budget's lease-release
boundary. If another budget is open, its normal switch protection is preserved.
Deletion retains the existing authoritative relay deletion, local file cleanup,
worker close and ownership lifecycle. There is no deleted-budget recovery workflow
in this branch; use an ordinary exported backup to recover a deleted budget.
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
  protected switch/reset/restore operations; users still need exported backups
  outside this origin. Deletion intentionally has no automatic safety capture.
- Manual/initial-import points can accumulate without a count ceiling; no emergency
  cap is imposed. Rolling history retains monthly representatives, not a fixed
  total count. Interrupted captures/failed pruning can also leave orphan files.
  Existing points remain outside budget deletion cleanup and can outlive a deleted
  budget; deletion creates no new snapshot. There is no UI to recreate deleted
  budgets from these remaining files, and no orphan sweep is introduced here.
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

Original implementation validated on 2026-09-03 (corrective-pass results below):

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

## Corrective pass

This pass isolates OPFS catalogues, separates timed/event/protected retention, and
removes deletion-triggered capture without changing SQLite capture or staged restore
architecture. Focused tests cover corrupt/unreadable neighbouring catalogues,
namespace encoding and traversal inputs, manifest identity and SHA-256 validation,
independent retention classes and UTC boundaries, plus deletion with the target,
another budget, or no budget open. Existing capture failure, switch draining,
mutation scheduling, restore quarantine and real-SQLite integration checks remain.
No real-browser performance validation is claimed. SAH-pool export still allocates
a full database-sized buffer in the worker; WAL serialization can likewise require
database-sized WASM memory.

Corrective-pass validation on 2026-09-03:

- Focused catalogue/retention/coordinator tests: 22 passed; database lifecycle
  tests: 16 passed, including seven deletion cases; architecture tests: 4 passed.
- Full unit suite: 135/135 files passed, including lifecycle/ownership,
  mutation-only scheduling, restore replacement and pending-recovery quarantine.
- Full integration suite: 11/11 files passed, including both restore-point suites
  (real SQLite snapshots with 30,001 transactions and concurrent writer exclusion;
  owner-authorized relay restore transitions) and launcher lifecycle coverage.
- Existing regressions: 2/2 files passed, covering deletion resurrection and
  import rollback. All files were discovered and run individually with the installed
  `tsx` CLI, as above; the expanded focused files were also rerun separately.
- `pnpm test:web-build`: TypeScript and production Vite build passed.
- `pnpm audit:persistence` regenerated the inventory (only its timestamp changed);
  `pnpm docs:architecture:check` passed, including `audit:persistence:check`.
- `git diff --check` passed. The requested obsolete-name and deletion-reason
  searches found no matches. Storage-path search confirms budget-scoped adapters
  for list/capture/read/pruning, with no flat-layout fallback.

Corrective changes are confined to the restore-point store, retention and types;
the ownership/exclusive-release and query-client deletion boundary; this document
and generated persistence inventory; the restore-point unit and architecture tests,
database lifecycle tests, and worker integration test adapter. No change is made to
the worker capture, staged replacement, relay restore or import algorithms.
Test success is evidence for review, not independent merge approval.
