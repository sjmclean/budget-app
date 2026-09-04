# SQLite Restore Points

## Scope and audit

Restore points represent complete authoritative SQLite database images, not domain
mutation chains. Full-file copies were replaced because a user's approximately
37.7 MiB / 20,769-transaction budget consumed another full image after two edits.
The v2 content-addressed format reuses unchanged bytes while each manifest remains
independently reconstructible. No base snapshot, mutation replay, WAL replay chain,
or compatibility path for this unmerged branch's earlier storage formats exists.
Normal downloadable SQLite Backup/Restore is separate and unchanged.

The audit covered capture/export, the installed SQLite WASM code, OPFS publication,
staged replacement, retention, ownership, lifecycle and relay recovery. The installed
`@sqlite.org/sqlite-wasm@3.53.0-build1` runtime reports an 8192-byte default page size
and `auto_vacuum=0`. Production code sets neither page size nor automatic vacuum and
does not run VACUUM. Imported databases can differ: capture validates the actual
SQLite header, not an assumed default. The user's actual database was not available
for byte-level audit in this run.

SAH-pool `exportFile()` removes the pool's private prefix and returns the ordinary
SQLite image. Its installed implementation allocates one full-size Uint8Array.
Native rollback-journal OPFS exposes the database file for bounded reads. The
existing WAL capture uses SQLite serialization (including uncheckpointed pages)
and normalizes header read/write modes to rollback-journal format.

SQLite uses fixed-size pages: ordinary localized edits do not insert bytes into
the file and shift every later offset. B-tree splits, index updates, overflow and
freelist changes can touch multiple pages or append/reuse pages. A major import,
page-size change or VACUUM may reshape most of the image; no reuse guarantee is
made for those operations. VACUUM rebuilds the database rather than preserving
physical layout. Sources: [SQLite file format](https://www.sqlite.org/fileformat.html),
[VACUUM](https://www.sqlite.org/lang_vacuum.html),
[SQLite WASM persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md).

## Chunk size decision and measured locality

Chunks are **256 KiB**, starting at byte zero; the final chunk may be shorter.
256 KiB is a multiple of every valid SQLite page size (512 through 65536 bytes).
Thus chunk boundaries never split a page. Hashes cover content only, without offset,
reason or revision; lengths and reconstruction order belong in the manifest.
Identical byte sequences can be reused at different offsets.

A native SQLite 3.53.2 audit fixture used 20,769 rows, an amount index, 1750-character
memos, and 8 KiB pages to match the bundled WASM default. Its image was 42,876,928
bytes (40.9 MiB); repeated serialization without edits was byte-identical.
One amount edit and one fixed-length memo edit produced:

| Chunk size | References/image | New chunks | New payload bytes |
| --- | ---: | ---: | ---: |
| SQLite page (8 KiB) | 5,234 | 3 | 24,576 |
| 64 KiB | 655 | 2 | 131,072 |
| 256 KiB | 164 | 2 | 524,288 |
| 1 MiB | 41 | 1 | 1,048,576 |
| 4 MiB | 11 | 1 | 4,194,304 |

The chosen size balances small-edit amplification with OPFS file/open/GC overhead:
about 151 references for a 37.7 MiB image rather than thousands of page files.
64 KiB improves locality but roughly quadruples file/reference operations; 1–4 MiB
reduces catalogue overhead but rewrites much more for sparse changes. All choices
must scan/hash the complete image; this is storage deduplication, not incremental
capture CPU. A 4 KiB-page audit also showed stable exports and localized changes.

After deleting every third row and running VACUUM, the 8 KiB fixture produced a
28,573,696-byte image with no chunk reuse at any tested size, including page-sized.
Page-sized storage therefore does not guarantee protection from wholesale
reshaping. Fixed page-aligned chunks were effective for the small edits tested.

The shipped capture function is also tested with a real 35,168,256-byte database,
30,001 padded transactions and 8 KiB pages (135 references). Two adjacent memo edits
added 524,288 bytes in native-OPFS and SAH-pool adapters, and 262,144 bytes in WAL
serialization. A subsequent identical image added zero chunk bytes in all three
modes. These are reproducible integration-fixture observations, not measurements
or promised percentages for the user's budget. Real app edits can additionally
modify projections, metadata, indexes and outbox pages.

## Responsibilities and layout

- `restorePointTypes.ts`: v2 metadata, reasons and semantic labels.
- `restorePointRetention.ts`: unchanged independent UTC retention classes.
- `restorePointStore.ts`: budget-scoped chunks, manifests, integrity and GC.
- `restorePointCoordinator.ts`: unchanged dirty mutation coalescing.
- `restorePointLifecycle.ts`: unchanged mutation subscription and reevaluation.
- `localBudget.worker.ts`: consistent capture and streamed candidate construction.
- `restorePointReplacement.ts`: unchanged journal/epoch transition and recovery.

```
budget-app-sqlite-restore-points/
  <encoded-budget-id>/
    manifests/<restore-point-id>.json
    chunks/<sha256-hex>.bin
    chunks/<unique-id>.partial       # unpublished, disposable staging
```

Budget directory encoding remains `budget-` followed by four lowercase hexadecimal
digits per UTF-16 code unit. It is deterministic and injective, including unusual
Unicode IDs, with no separators or dot segments. No global manifest scan exists.
Corrupt/unreadable Budget B manifests cannot affect Budget A operations.

The schema is `sqlite-restore-point.v2`: ID, budget ID/name, reason, timestamp,
epoch/revision, mutation count, domain counts, full `totalBytes`, full SHA-256
`databaseHash`, ordered `chunks: { hash, length }[]`, `newBytesStored` and
`newChunkCount`. Hashes are 64 lowercase hexadecimal characters. The complete list,
exact expected chunk lengths, ID/filename, budget ownership and metadata are
validated. A manifest does not refer to another restore point.

## Capture publication and interruption

Capture still runs inside the drained owned SQLite operation and a SQLite
`BEGIN IMMEDIATE` transaction. `quick_check` must pass before reading the image.
The WAL path includes uncheckpointed data. No application mutations compete with
capture. Every storage capture, listing, reconstruction and GC uses the same
exclusive per-budget Web Lock, shared across workers/tabs. Lack of Web Locks fails
closed; there is no unsafe single-context fallback.

1. Read and validate that budget's catalogue under the lock.
2. Obtain bounded ranges from the consistent database image; validate the header,
   page-aligned total size and each returned range.
3. Hash the complete ordered stream incrementally and each chunk independently.
4. For an existing final chunk, verify length and SHA-256 before reuse.
5. Write absent content to a unique partial file and verify it.
6. Publish the verified bytes at the hash-derived final name using OPFS writable
   atomic close, then verify the final file. This portable bounded copy avoids
   relying on file-move support. Writable staging is not authoritative until close.
7. Only after all chunks validate, publish the unique manifest by atomic close.
   That close is the commit point; published manifests are never rewritten.
8. Remove obsolete manifests according to existing retention, then run safe GC.

An interrupted write can leave a partial file or empty final handle; neither is a
valid chunk. Valid final identities are immutable. An invalid final handle is
removed/rebuilt only after the locked complete catalogue proves it unreferenced.
Invalid referenced content fails closed, without overwriting it. Lost final-chunk
or manifest-close acknowledgements are accepted only if the final bytes verify.
If verification is uncertain, capture reports failure and leaks storage rather
than deleting something that might have been published.

Failed capture before manifest publication creates no listed restore point.
Empty manifest handles remain unpublished, matching the earlier failure policy.
A nonempty malformed or unreadable manifest surfaces as that budget's catalogue
problem. Abrupt browser/storage failures may leak temporary/unreferenced data;
OPFS quota/eviction and filesystem durability remain platform constraints.

## Retention and garbage collection

Retention policy is unchanged:

- Timed: 10-minute buckets below 6 hours; hourly below 24 hours; daily below 7 days;
  Monday-anchored weekly below 35 days; UTC calendar-month buckets thereafter.
- Ordinary semantic safety events: keep all below 24 hours; then latest per UTC day
  below 7 days, per Monday-anchored week below 35 days, and per UTC month thereafter.
- Manual and initial-import points are protected from automatic bucket thinning.

Classes and budgets never compete. Newest timestamp wins, then descending ID.
Equivalent reason + epoch + revision still reuses the existing point. There is no
count ceiling, and no automatic capture for unchanged budgets.

GC re-enumerates and validates the entire current budget catalogue after manifest
pruning, derives the union of referenced chunk hashes, and only then deletes
unreferenced hash-named chunk files and recognized partial files. No persisted
reference count is authoritative. Corrupt/unreadable catalogues abort GC before
any chunk removal. The lock spans captures and complete reconstruction, so GC
cannot race a not-yet-published manifest or a selected point being read.
Unknown filenames are not swept.

Retention/GC failure cannot fail an already completed capture. Shared chunks survive
removal of any one manifest while another references them; deleting the last
reference allows reclamation. An explicit store `collectGarbage(budgetId)` pass
also exists; there is no new UI cleanup workflow. Protected manifests, monthly
representatives, failed cleanup and snapshots predating budget deletion may still
accumulate. Budget deletion does not sweep this separate storage namespace.

## Reconstruction and atomic restore

The worker loads the validated manifest and streams its references in order while
holding the budget storage lock. Each chunk is length/hash checked before append
to the existing temporary baseline-replacement file. A streaming full-image hash
and exact length must verify before `read()` returns; partial stream consumption
fails. Only then may the worker commit the staged physical candidate. Missing,
corrupt or truncated chunks, or a wrong full-image hash, abort staging and never
promote a candidate. There is no concatenated database-sized main-thread buffer.

The rest of restore is preserved: synchronise, capture a before-restore safety
point, construct a new physical generation, validate SQLite/domain counts, start
a fresh epoch with empty outbox/conflict inbox and cursor zero, stage/hash-check
relay chunks, persist/flush durable local intent, then owner-authorized relay
commit. Concurrent epoch/baseline/cursor changes reject without overwriting them.
Only confirmed remote commit permits local authoritative pointer publication.
Certified rejection rolls back; uncertain commit yields `RESTORE_PENDING`,
quarantines queued work and replays the durable intent on reload. Ordinary editor
baseline APIs do not bypass this protocol.

## Scheduling and lifecycle preserved

Successful local mutation events are the only automatic dirty signal. Mutations
coalesce for approximately ten minutes; sleep/resume creates at most one overdue
point. The 30-second heartbeat and focus/visibility reevaluation remain. Failed
capture leaves dirty state pending.

Switch safety capture is awaited before release; failure blocks release/switch.
Import/reset/restore safety and initial-import after local promotion plus relay
publication remain. There is no transaction-count snapshot skip. Deletion creates
no restore point, including its target's release boundary; protection for another
open budget remains. No deleted-budget recovery UI/workflow is implemented.
Users need ordinary exported backups to recover deleted budgets.

## Memory, UI metrics and remaining limits

- Native rollback-journal capture reads bounded 256 KiB ranges.
- SAH-pool still allocates one complete worker-side database buffer in its installed
  export API. Capture uses `subarray()` views, not repeated whole-buffer copies.
- Installed WAL serialization allocates a database-sized WASM result, copies it to
  a full JS Uint8Array, then frees the WASM allocation. This existing peak remains.
- Deduplication adds bounded chunk buffers (source, staged verification, atomic
  write copy and readback) and SHA-256 state, not another full database buffer.
  Manifest/catalogue/live-set memory scales with retained references.
- Restore reconstructs to an OPFS staged file in the worker. The existing physical
  importer uses bounded ranges; no new main-thread full-image copy is introduced.
  The separate relay baseline upload and its existing memory/network costs remain.
- All image bytes are still read/hashed, and reused chunks are verified. Smaller
  physical growth does not eliminate capture time or the held query lease.
- Settings reports logical database size, new chunk payload KiB at capture,
  new unique chunk count and ordered reference count. These are historical capture
  metrics, excluding JSON manifests, transient staging, filesystem overhead and
  later GC. No ambiguous cumulative savings or reuse percentage is displayed.
- Deduplication is per budget, not cross-budget. Major reshaping can require nearly
  a full new image. No compression or fixed storage ceiling is introduced.
- No real-browser performance, eviction or crash durability validation is claimed;
  simulated OPFS/locking adapters and native SQLite do not replace that testing.

## Validation

Focused tests cover unchanged scheduling/retention plus identical-content reuse,
single-chunk edits, duplicate content within an image, chunk/manifest integrity,
failed/interrupted/uncertain writes, safe repair of unreferenced incomplete
identities, shared-chunk liveness, failed pruning/GC, corrupt catalogue isolation,
cross-instance lock ordering, strict stream completion and namespace safety.
Worker integration executes shipped capture/prepare functions against real SQLite
with simulated OPFS and checks exact reconstruction, material dedupe, concurrent
writer exclusion, staged append sizes and no promotion on corruption.
Relay, ownership, lifecycle, initial-import and pending-recovery tests remain.

Validation on 2026-09-04:

- Focused restore-point unit file: 45 tests passed; architecture/UI contracts:
  4 tests passed; shipped worker integration: 6 tests passed; relay restore:
  2 tests passed.
- Full unit suite: 135/135 files passed, including ownership/lifecycle regression,
  mutation scheduling, retention, deletion and pending-restore recovery.
- Full integration suite: 11/11 files passed, including worker/relay restore and
  launcher/import lifecycle. Existing regressions: 2/2 files passed.
- Suites were discovered from their complete directories and run individually
  with the installed tsx CLI, avoiding the existing Windows runner's pnpm spawn
  resolution problem. No tests were disabled or omitted.
- pnpm test:web-build passed TypeScript and production Vite build.
- pnpm audit:persistence regenerated the inventory;
  pnpm docs:architecture:check passed, including audit:persistence:check.
- git diff --check passed. Production-source searches found no stale restore-point
  payload filename helper, v1 schema or full-copy UI description. Remaining
  .sqlite3 references belong to active/physical/staged databases and normal export;
  totalBytes describes logical image length or separate baseline/relay transfer.

Scheduling/retention, deletion policy, ownership and restore journal/relay algorithms
are unchanged. This pass changes only the snapshot storage/types, worker capture
range and reconstruction adapters, Settings metrics, associated tests and audit
documentation. Test success is evidence for independent review, not merge approval.
