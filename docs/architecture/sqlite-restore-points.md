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

Chunks are **64 KiB**, starting at byte zero; the final chunk may be shorter.
This is the smallest globally fixed size divisible by every supported SQLite page
size (512 through 65536 bytes). The bundled runtime was rechecked: 8192-byte pages,
SQLite 3.53.0, auto_vacuum=0. Blank creation, Actual import and the YNAB4 import
client all call beginStagedImport, which creates a fresh database with that runtime
default and does not override page size. Physical promotion/export preserves page
boundaries. Previously restored/external SQLite images can have other page sizes;
the user's existing browser database header was not directly inspected.

### User-reported browser observations at the previous 256 KiB size

For approximately 20,769 transactions / 37.7 MiB and 151 references, the initial
seed added 38,584 KiB (151 new chunks). Later checkpoints added 6,344 KiB (25 new)
and 4,296 KiB (17 new) after one memo edit. This is evidence of storage amplification
for the real workload, not proof that exactly 17 individual SQLite pages changed.
These observations came from the user, not a browser benchmark run by this agent.

### Same-edit synthetic comparison

The retained 30,001-row integration fixture has a 35,168,256-byte image and 8 KiB
pages. One fixed-length memo edit changes page 2148; rollback-journal/native-file
exports also change header page 1. Candidate comparison hashes the exact before
and after images captured by the shipped worker, not a hypothetical fixed count.

| Chunk size | References | New bytes: native/SAH | New bytes: WAL | Approx. manifest bytes |
| --- | ---: | ---: | ---: | ---: |
| 32 KiB | 1,074 | 65,536 (2 chunks) | 32,768 (1) | 98,281 |
| 64 KiB | 537 | 131,072 (2 chunks) | 65,536 (1) | 49,416 |
| 128 KiB | 269 | 262,144 (2 chunks) | 131,072 (1) | 25,296 |
| 256 KiB comparison baseline | 135 | 524,288 (2 chunks) | 262,144 (1) | 12,968 |

Actual selected-size manifests were 49,421–49,422 bytes (metadata strings affect
JSON length). Identical snapshots still add zero chunk bytes. Tests assert relative
improvement and valid reconstruction, not one brittle exact changed-chunk count.
At 64 KiB this fixture writes one quarter of the baseline's changed payload bytes.
It does not reproduce all application projections/index/outbox writes and does not
promise that fraction for the real memo-edit workload.

64 KiB is selected over 128 KiB for better locality, and over 32 KiB because it
halves file/reference overhead and supports 64 KiB-page databases without adding
page-dependent layout policy or schema fields. 32 KiB was measured for the 8 KiB
fixture but is not aligned to a supported 64 KiB page. 256 KiB remains only an
explicit historical/comparison baseline.

### Overhead and reproducibility

For the user's rounded 37.7 MiB image, expect approximately 603–604 references,
versus 151 at the previous granularity, and roughly 55.5 KB (54.2 KiB) of manifest
JSON with comparable metadata. Chunk data hashes still cover content only; metadata,
timestamps, reason and offsets do not affect sharing.

A single local CPU/Blob diagnostic run over the 33.5 MiB fixture took approximately
74–90 ms to hash/chunk the image across candidates. Simulated per-file verified
reconstruction took approximately 165–250 ms. In-memory chunk-name/live-set
enumeration was usually sub-millisecond, with a roughly 3 ms outlier at 64 KiB
and warm-up-sensitive 6 ms results at 32 KiB. These are not OPFS measurements or speed assertions.
There are roughly four times as many file operations at 64 KiB as at 256 KiB.

The shipped selected-size capture with bounded test file reads took approximately
1.0–1.4 seconds to seed, 0.7–0.9 seconds for the memo checkpoint, and 0.4–0.5 seconds
for verified reconstruction in sampled native/SAH/WAL adapters. The native adapter
now models bounded reads rather than rereading a complete database per chunk;
old timings from that test artifact are not valid comparison baselines. Actual
OPFS open/close latency, browser memory and capture duration require manual testing.

Illustrative upper bounds before retention, assuming 48 dirty checkpoints over an
8-hour day and 604 distinct seed chunks: one newly unique chunk per checkpoint
leaves 652 chunk files; 17 per checkpoint leaves 1,420. Add up to 49 manifests.
This is a workload assumption, not a measured typical day; broad writes can add far
more and retention/shared content can reduce it. Known-name scans and GC remain
linear in stored chunks plus manifest references. At these low-thousands estimates
the existing scan remains simple; no measured browser evidence justifies a new
chunk index. Long histories and protected snapshots remain a file-count risk.
Restore must open/verify approximately four times as many smaller chunk files,
while still hashing the same logical byte length.

Reproduce locality/CPU diagnostics with:
`node node_modules/tsx/dist/cli.mjs tools/performance/restore-point-granularity.ts`.
The helper reports 1-based changed-page ranges, candidate counts/JSON sizes,
physical-file counts, hashing, simulated restore and GC enumeration times.
The worker integration repeats comparison on native-file, SAH and WAL images.

### Format and broad rewrites

Schema remains sqlite-restore-point.v2 with globally fixed layout validation.
No chunkSize field or migration is needed for this unreleased internal format.
Existing 256 KiB manifests are intentionally incompatible and fail closed; testing
the new build requires a clean restore-point catalogue. This change does not
automatically delete or migrate earlier test snapshots. The active budget and
ordinary exported backups are unaffected.

Earlier audit results showed that deleting every third row and running VACUUM
could rewrite essentially all content at every tested granularity. Major imports,
VACUUM, page-size changes and widespread projection updates can still produce
large checkpoints. No storage ceiling or guaranteed real-browser target is added.

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

- Native rollback-journal capture reads bounded 64 KiB ranges.
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

- Focused restore-point unit file: 47 tests passed; architecture/UI contracts:
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

This granularity follow-up changes one production constant. Storage architecture,
schema fields, GC, reconstruction, Settings metrics, scheduling/retention, deletion
policy, ownership and restore journal/relay algorithms are unchanged. Tests add
candidate-size/page-range diagnostics, realistic same-edit comparison, all-page-size
alignment and malformed-layout coverage. Audit tooling and documentation record
the tradeoffs. Test success is evidence for independent review, not merge approval.

## Real-world page-churn investigation

### Evidence boundaries

**Earlier restore-point observations supplied by the user:** a roughly 37.7 MiB
budget with about 20,769 transactions showed 17/151 new 256 KiB chunks (4,296 KiB)
and 58/604 new 64 KiB chunks (3,712 KiB). These were capture-interval measurements,
not an isolated before/after memo pair. The apparent 13.6% improvement prompted
the investigation but must not be interpreted as the cost of a pure memo edit.

**Isolated real-browser backup-pair evidence supplied subsequently by the user:**
exactly one memo edit in a 39,526,400-byte database with 8,192-byte pages and about
20,769 transactions changed **14 / 4,825 pages** (0.2902%). The other 4,811 pages
remained identical. Changed pages represent 114,688 bytes (112 KiB), but only
**523 byte positions** differ. These are supplied measurements, not a new run of
the user's private files in this documentation follow-up.

Changed page ranges (1-based): `1-2, 15, 17, 26-30, 1036, 3150, 4695, 4706, 4804`.
Attribution includes `sqlite_schema`, `local_budget_metadata`,
`local_budget_projection_cache`, its version/index structures,
`local_budget_projection_dirty`, `local_budget_outbox`, outbox indexes,
`sqlite_sequence`, `local_budget_outbox_pending`, `local_transactions`, and the
freelist. The transaction page has 129 differing bytes and the outbox page 322;
most remaining pages differ by only a handful of bytes.

Content-addressed cost for this same isolated pair (payload only):

| Chunk size | Ordered references | New chunks | New storage |
|---|---:|---:|---:|
| 8 KiB | 4,825 | 14 | 112 KiB |
| 16 KiB | 2,413 | 11 | 176 KiB |
| 32 KiB | 1,207 | 10 | 320 KiB |
| **64 KiB** | **604** | **9** | **576 KiB** |
| 128 KiB | 302 | 7 | 896 KiB |
| 256 KiB | 151 | 6 | approximately 1.45 MiB |

The 256 KiB storage value retains the supplied rounding; the other storage values
are exact. The clean memo edit costs **576 KiB**, not 3,712 KiB, under current
64 KiB chunking. The earlier 3,712 KiB restore point therefore included additional
SQLite changes between captures; its precise intervening changes are not identified
by this pair. It is not evidence that dedupe is ineffective.

**Controlled fixture evidence:** `sqlite-page-churn.ts` creates 20,769 records
using the real register schema and invokes function bodies extracted from the
shipped persistence worker. The 23.9 MiB fixture has 8 KiB pages. It intentionally
contains eight accounts, 300 payees, 80 categories, provenance for every row,
tags for one third, and splits for one twentieth. Each case starts from identical
bytes and has one outbox mutation and a local-revision delta of one:

| Mutation | Changed pages / page bytes | 64 KiB new bytes | Ranges (1-based) |
|---|---:|---:|---|
| memo | 15 / 120 KiB | 504 KiB | 1-2, 17-18, 26-30, 90-91, 108, 367, 1761, 3053 |
| amount | 17 / 136 KiB | 632 KiB | 1-2, 17-18, 26-30, 90-91, 108, 199, 367, 1761, 2771, 3053 |
| payee | 16 / 128 KiB | 568 KiB | 1-2, 17-18, 26-30, 90-91, 108, 367, 878, 1761, 3053 |
| cleared | 16 / 128 KiB | 568 KiB | 1-2, 17-18, 26-30, 90-91, 108, 199, 367, 1761, 3053 |
| add | 23 / 184 KiB | 1016 KiB | 1-2, 17-18, 26-30, 64, 199, 367, 458, 1140, 1749, 1761, 1870, 2122, 2771, 3023, 3039, 3053, 3055 |
| delete | 20 / 160 KiB | 832 KiB | 1-2, 17-18, 26-30, 90-91, 108, 126, 199, 367, 925, 1140, 1749, 1761, 2771 |
| category assignment | 10 / 80 KiB | 256 KiB | 1-2, 9, 17-18, 26-30 |
| split memo | 28 / 224 KiB | 1144 KiB | 1-2, 17-18, 26-30, 89, 91, 108, 130, 132, 134, 178, 181, 256, 341, 367, 423, 904, 1336, 1761, 2900, 2939, 3033, 3053 |

The page-level content cost equals the page-byte column because these changed
pages are unique. Object attribution via `dbstat` identifies transaction and
register indexes, the outbox and its indexes, metadata, projection-dirty state,
and child provenance/tag/split structures. Unchanged pages remain byte-identical
and add/delete do not shift downstream pages. An artificial twelve-month 3 MiB
projection cache raises a memo edit only to 19 changed pages (152 KiB page cost,
640 KiB at 64 KiB); freed overflow pages mostly retain identical bytes. This is a
sensitivity experiment, not a claim about real projection payloads. `VACUUM`
rewrites 3,029/3,055 pages (99.15%), as expected.

### Memo-edit write trace and amplification

The UI account-register hook executes the history transaction command, which
routes `updateTransaction` through the budget's local-first owner. Record
generation loads the existing record; ordinary edits emit one record, while a
transfer edit emits both legs in one operation group. The client then calls the
worker's transaction batch and reports the committed mutation.

For an ordinary memo edit the worker executes: `BEGIN IMMEDIATE`; select the old
month; full-row transaction upsert; delete all splits; delete all tags; delete all
import provenance; reinsert every supplied split, tag and provenance row; upsert
the projection-dirty month; delete projection-cache rows from that month onward;
insert an outbox row containing the full transaction payload (and operation-group
JSON for paired transfers); read then upsert `localRevision`; `COMMIT`; then
read-only count/metadata queries for the returned manifest. SQLite maintains the
transaction primary key and six register/summary/category/month/payee indexes.
There are no FTS virtual tables or triggers. Payee/account/category rows are not
updated. Undo/redo commands live in an in-memory per-budget controller rather than
another SQLite history table. The unconditional child delete/reinsert, full
payload journal write and projection-cache invalidation are surprising possible
amplifiers; this audit deliberately does not change them.

### Native, SAH and WAL/export evidence

Bundled SQLite 3.53.0 exposes `dbstat` and `sqlite_dbpage`; its default page size
is 8 KiB. For a populated real-schema database, repeated
`sqlite3_js_db_export()` was byte-identical and export output exactly equalled the
ordered `sqlite_dbpage` bytes before and after an isolated update: two underlying
pages changed and export added zero. Native SQLite 3.53.2 WAL serialization was
stable across repeated exports. An uncheckpointed main file lacked the same 15
pages changed by the logical mutation; after `wal_checkpoint(TRUNCATE)` its bytes
exactly equalled serialization. Production's WAL capture normalization changes
only header offsets 18 and 19 (one page, two bytes). Schema cookie, page count and
freelist header fields stayed stable in that update. Raw native-file results model
native OPFS/SAH byte semantics; Node cannot execute the browser SAH-pool or OPFS
VFS, so this is not direct browser proof.

Run `pnpm tsx tools/performance/sqlite-page-diff.ts before.sqlite after.sqlite`
against ordinary SQLite backups taken immediately before and after a single edit.
The deterministic JSON includes header counters, sizes/counts, differing bytes,
ranges and offset deciles, before/after `dbstat` ownership plus freelist pages, and
actual content-addressed cost at the page size and 8/16/32/64/128/256 KiB. It
deserializes copies in memory and never writes the supplied files. Existing normal
manual SQLite backup/export is the development extraction path: in Settings,
External Backups, choose **Backup budget** (not Budget package), and preserve the
downloaded `.budget-sqlite` file as A. Perform exactly one edit, repeat Backup
budget and preserve B. Pass those files directly to the command; renaming is not
required. Navigating back to Settings and background sync can add work, so also
record the two local revisions, pending outbox count, backend and journal mode
when available; do not call the pair a pure memo test if other mutations occurred.
Do not copy an uncheckpointed WAL main file alone;
use the complete export or include/checkpoint its WAL. Keep files private: they
contain financial data, and the report intentionally emits no row values.

### Decision: retain 64 KiB

The isolated real pair confirms sparse, scattered page changes, not hundreds of
genuinely rewritten pages. Nevertheless, **64 KiB remains the selected production
chunk size**. Page-level 8 KiB dedupe would reduce this checkpoint from 576 KiB to
112 KiB, but increase ordered references from 604 to 4,825 (roughly 8x), with
potentially many more unique OPFS files and per-chunk read/hash, manifest,
catalogue, reconstruction and GC operations. References are not necessarily
distinct files because identical content is shared. The additional complexity
and operation pressure outweigh the storage benefit for the selected balance;
page-level production dedupe is rejected for now, not deemed technically invalid.

32 KiB would reduce this edit to 320 KiB but approximately double reference/file
pressure. It also loses 64 KiB's alignment with every supported SQLite page size
from 512 bytes through 64 KiB. It is therefore not selected either. Broad
operations such as `VACUUM` or imports may still rewrite most pages; smaller chunks
cannot guarantee small checkpoints for those operations. No production behavior,
chunk size, schema, GC, lifecycle, retention, scheduling, ownership or restore
logic changed, and chunk-size implementation is not reopened by this follow-up.

Reproduce the controlled runs with `pnpm tsx tools/performance/sqlite-page-churn.ts`
and `pnpm tsx tools/performance/sqlite-export-audit.ts`. The first emits the full
ordered SQL statement trace (bindings omitted), affected-row counts, differing
bytes and ownership for every case. The memo fixture changes only 1,163 actual
byte positions, despite representing 120 KiB of changed pages. Physical page
attribution cannot separate memo bytes from cell reorganization, `updated_at`,
or freed payloads; it is not a byte-perfect logical-field accounting system.
The fixture starts with no outbox and does not exercise transfer edits, projection
repopulation after invalidation, background replication, or the full UI/ownership
queue. Native default pages are 4 KiB; the fixture explicitly selects 8 KiB to
match the bundled runtime, not to assert the actual imported budget's page size.
All cases have 3,055 pages before and after; a memo leaves 99.51% byte-identical.

Validation for this audit: five diagnostic unit tests; real-worker mutation
integration; all 136 unit files, 12 integration files and two regression files
passed. This includes focused restore-point, local-first transaction, ownership
and worker/relay tests. `pnpm test:web-build`, `pnpm audit:persistence`,
`pnpm docs:architecture:check` and `git diff --check` passed. Suite files were run
through the installed tsx CLI individually because of the existing Windows runner
resolution limitation. The export script's byte-equality assertions also passed.

Final browser-evidence documentation/test follow-up: six focused page-diff tests
and 47 focused restore-point tests passed, along with `pnpm test:web-build`,
`pnpm docs:architecture:check` (including `audit:persistence:check`) and
`git diff --check`. The added guard asserts that the selected production constant
remains 64 KiB and aligns with every supported page size; no private database
layout is encoded in tests. No production code changed, so full suites were not
rerun for this small follow-up.
