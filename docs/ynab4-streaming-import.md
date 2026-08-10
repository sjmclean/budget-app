# YNAB4 streaming import architecture

## Current data flow

`BudgetImportDialog.tsx` is the browser boundary. Directory picker, drag/drop and
`webkitdirectory` inputs create `Ynab4PackageEntry` values. `Budget.ymeta` is
read eagerly; budget files remain `Blob` handles until
`prepareYnab4PackageEntries` selects the active file.

Package location is resolved by `package/discoverPackage.ts`. `Budget.ymeta`
supplies `relativeDataFolderName`; `package/selectLatestDevice.ts` and
`package/readBudget.ts` select the latest complete device's `Budget.yfull`,
falling back to the single `Budget.yfull` or `Budget.json`. Phase one reads only
that selected file, calls `JSON.parse` once, stores the object in `parsedData`,
and clears the large UTF-16 `text` string.

Discovery and preview (`analyzeYnab4Package.ts`), launcher validation and
mapping (`ynab4LauncherImport.ts`), and the accuracy/category/monthly audits all
reuse `readYnab4BudgetData` and therefore the cached complete object.
`validateYnab4SourceIdentities` and `validateYnab4TransferIntegrity` run before
mapping. `mapYnab4Transactions` maps registers, split rows and transfer pairs;
the launcher maps accounts, category groups/categories, payees and scheduled
transactions, and `mapYnab4BudgetMonths` maps monthly budgets. Persistence is
performed through the launcher import plan and active storage backend.
`captureYnab4LauncherImportRollbackSnapshot` and `rollbackYnab4LauncherImport`
protect failure paths; `commitYnab4LauncherImport` finalises the registry entry.
`auditYnab4LauncherImportAccuracy` and package-level correctness, hierarchy and
monthly-budget audits verify the result.

Source shapes are currently structural `Record<string, unknown>` values. The
real top-level large arrays are `transactions` and
`scheduledTransactions`. Reference collections retained by the new layer are
`accounts`, `masterCategories` (with nested `subCategories`), `payees`, and
`monthlyBudgets`; other non-large top-level fields are available in `values`.

## Existing whole-source assumptions and allocations

The production whole-file parse remains in `package/readBudget.ts`. Its
`prepareYnab4PackageEntries` calls `File/Blob.text()` for small `Budget.ymeta`
files and the selected budget data file. `parseBudgetEntry` calls `JSON.parse`
when `parsedData` is absent. Callers in discovery, mapping and audits assume a
synchronously available complete object. Other audit modules contain fallback
`JSON.parse(entry.text)` paths for legacy fixtures.

The principal peak allocations are the Blob's decoded UTF-16 string, the
complete parsed object graph, derived transaction/register/split arrays,
mapping lookup maps, monthly views, persistence serialisations and rollback or
audit snapshots. Phase one releases the source string, but the parsed
transaction graph still coexists with mapped structures.

## Staged architecture

The shared boundary is
`ImportSourceReader<TSummary, TReferenceData, TRecord>`. It exposes format
inspection, reference loading, bounded record streaming and cleanup without
assuming JSON, an archive container, SQLite, or any source schema. Cancellation
is carried by format-neutral read/stream options. Format implementations may
publish richer diagnostics and progress while retaining the generic
`unitsConsumed`, `totalUnits`, `phase` and `recordsYielded` vocabulary.

`ImportSession<TSummary, TReferenceData, TRecord, TPersistedBatch, TResult>`
separates source validation, staging startup, batch persistence, commit,
rollback and cleanup. It does not prescribe a database, transaction mechanism
or record identity representation.

1. Milestone 1 (this change) adds an explicit reusable
   `Ynab4JsonSourceReader`, with `Ynab4SourceReader` retained as a compatibility
   alias.
   It accepts browser `Blob`/`File`, string/byte fixtures, or a synthetic
   `Ynab4ChunkSource`. It incrementally decodes bounded slices, materialises
   reference data, and yields transaction arrays in bounded batches.
2. Milestone 2 will adapt validation and mapping to consume staged reference
   data and transaction batches, without changing financial semantics.
3. A later persistence milestone will write mapped batches transactionally,
   preserve transfer/split reconciliation across batch boundaries, and replace
   whole-import rollback snapshots with database transaction/staging semantics.
4. Discovery, preview and correctness audits will then gain streaming-aware
   counters/sampling and reconciliation passes. Only after equivalence gates
   pass will the browser dialog opt into the streaming pipeline.

There is deliberately no size threshold or automatic production switch.
`parsedData`, `text`, and all legacy APIs remain intact.

## Future Actual Budget archive reader

A future `ActualBudgetArchiveSourceReader` would implement the same generic
reader contract with Actual-specific summary, reference and row types. It must
not reuse `IncrementalJsonCursor`, because `metadata.json` and `db.sqlite` have
different access and validation requirements.

1. Archive inspection would read the central directory and selected entry
   streams only, enforcing entry-count, path, compression-ratio and size limits.
   It would not extract every entry or concatenate the archive in memory.
2. `metadata.json` would be opened as one explicitly bounded small entry,
   decoded and validated against the supported Actual metadata contract. It
   would drive format/version detection but would not be treated as a YNAB4
   top-level JSON document.
3. `db.sqlite` would be copied or streamed to a temporary/staged backing store
   appropriate to the runtime, then opened through the repository's existing
   SQLite facilities. Browser support would require the repository-approved
   SQLite/WASM or persistence adapter rather than Node modules in browser code.
4. Reference tables would be queried intentionally. Large tables would use
   stable indexed keyset pagination inside a read transaction, yielding bounded
   batches rather than using an unbounded result array or fragile large
   `OFFSET` scans.
5. Required Actual schema migrations would run only against an isolated
   temporary copy under a database transaction, after version validation and
   before destination writes. The uploaded archive would remain immutable.
6. Actual primary/foreign IDs, row ordering requirements and relationships
   would be preserved in typed records. Referential-integrity checks would run
   before commit, with cross-batch identity maps stored in bounded staging
   tables where necessary.
7. The generic import coordinator would pass those records to an
   Actual-specific `ImportSession`. Destination writes would remain staged
   until validation completes; commit would be atomic, failure/cancellation
   would invoke rollback, and both reader and session cleanup would close
   SQLite/archive handles and remove temporary storage.

This milestone intentionally provides no partial Actual reader, archive
dependency, Actual schema assumptions or automatic Actual import route.

## Parser decision

No dependency was added. The browser-compatible cursor uses only `Blob.slice`,
`arrayBuffer`, `TextDecoder`, `TextEncoder`, async iteration and
`AbortSignal`. It parses JSON tokens across arbitrary UTF-8 chunk boundaries,
compacts consumed text, enforces a nesting limit, rejects duplicate top-level
properties, and drops `__proto__`, `constructor` and `prototype` object keys.
This avoids uncertain browser bundling and whole-document buffering behavior
from a third-party parser.

Readers are reusable: each public read/stream operation creates a fresh cursor
over the same source. `close()` is idempotent, releases the source through its
optional close hook, and makes future operations fail. A yielded batch is a new
array; the reader keeps neither earlier batches nor earlier records.

Optional diagnostics count bytes, chunks, maximum unconsumed parser-buffer
bytes, records and batches. Progress callbacks report bytes consumed, known
total size, current collection and record count without financial data.

## Safety invariants

- Source order, source identifiers, tombstones, splits, transfer pairing,
  amounts, recurrence, category/payee references and monthly values must remain
  financially equivalent.
- The streaming path must never call whole-source `text()`, `json()`, or
  concatenate all bytes/text.
- Memory is limited to decoder/parser state, the current value, small
  collections and one consumer-visible batch.
- Cancellation is an `AbortError`, never a malformed-input result.
- Errors name the logical source, collection and approximate offset, but never
  include a full record or source text.
- Uploaded keys cannot mutate object prototypes; nesting is bounded and no
  dynamic code execution or Node-only browser import is allowed.
- Persistence must remain atomic and rollback-safe. No budget is committed
  until validation and correctness audit succeed.
- Production import cannot switch to streaming until mapping, persistence,
  rollback and audit stages have explicit incremental equivalents.

## Test and verification map

The focused suite is `pnpm test:ynab4:streaming-source`. Existing coverage is
classified through `test:ynab4-import` and `test:migrations`; the dedicated
package discovery, preview, extraction, launcher, atomicity, IndexedDB,
scheduled fidelity, amount/activity/category/transfer correctness and large
file memory groups remain authoritative. Browser boundary coverage includes
the folder-selection and browser build checks. `verify:ynab4-import` and
`verify:v527` are the repository-level YNAB4 verification entry points.
`pnpm test:import-source-contract` compiles and runs a synthetic relational
reader/session whose summary, reference and binary-key row types have no YNAB4
inheritance, proving the generic boundary is format-neutral.

## Remaining limitations

This milestone does not stream mapping or writes. Each independent operation
rescans the source, and small-data/metadata scans parse and discard large
records one at a time. Progress is byte-based only when total size is known.
The maximum size of one individual JSON record or small reference collection
is inherently not bounded by `batchSize`; later policy may add explicit record
and string limits. A 300 MB production import is not yet solved.

## Phase 2 overlay: staged coordination and incremental preflight

The Phase 2 overlay adds `runImportSession`, the format-neutral coordinator
that joins an `ImportSourceReader` to an `ImportSession`. Its order is:

1. inspect the source;
2. load reference data;
3. validate summary/reference compatibility;
4. begin staging;
5. stream and persist bounded batches;
6. commit only after the stream completes;
7. roll back on parsing, validation, persistence or cancellation failure;
8. close both session and reader while preserving the primary error.

`Ynab4StreamingPreflightSession` is the first YNAB4 Phase 2 session. It validates
accounts, categories, ordinary and transfer payees, transaction identity,
amount and references batch by batch. It retains transaction IDs and compact
transfer stubs—not transaction objects—so reciprocal transfers can be checked
even when their sides occur in different batches. Rollback clears all staged
state. This API is explicit and is not connected to the browser launcher.

The production importer still maps complete register and monthly-budget views
and persists them through the established audited path. Incremental destination
mapping/writes remain the next cutover step because register running balances,
display sorting, monthly activity, tag discovery and the existing accuracy
audit currently operate on completed mapped projections. Phase 2 therefore
provides the transactional coordinator and source preflight needed for that
cutover without weakening the current financial audit.

Focused verification:

```powershell
pnpm test:import-source-contract
pnpm test:ynab4:streaming-source
pnpm test:ynab4:streaming-phase2
pnpm test:v527
pnpm test:ynab4-import
pnpm test:migrations
pnpm --filter @budget-app/web build
```

## Phase 3 overlay: canonical streaming projection

Phase 3 adds an explicit
`buildYnab4LauncherImportPlanFromReader(reader, budget, now, options)` API.
It performs the following bounded-source workflow:

1. run the Phase 2 incremental preflight;
2. load small reference collections;
3. construct account/category/payee identity maps;
4. stream transaction batches and immediately map each source row into the
   existing canonical register transaction type;
5. release each source batch after mapping;
6. finalise register sorting, running balances and cleared/working balances
   once all batches succeed;
7. stream the normally small scheduled collection;
8. build tag, scheduled-transaction and monthly-budget projections through the
   existing production mapping functions.

The legacy mapper now delegates its transaction loop to the same
`appendYnab4TransactionBatch` and
`finaliseYnab4TransactionRegisters` primitives. This prevents financial logic
from forking between whole-object and streaming paths.

`tests/ynab4-streaming-phase3.ts` compares the complete canonical plan from the
legacy and streaming builders at batch sizes 1, 2, 3 and 500. Coverage includes
ordinary rows, Unicode, flags, splits, tombstones, reciprocal transfers,
schedules, register balances and monthly projections.

Phase 3 remains opt-in. The browser launcher still invokes the established
whole-object builder and audited persistence path. The streaming projection
retains canonical mapped transactions because the current entity writer and
accuracy audit require the completed register projection, but it no longer
retains the corresponding source transaction graph. Incremental entity writes
and streaming-aware accuracy auditing are the remaining production-cutover
work.

## Milestone 2: staged persistence

Milestone 2 begins with a format-neutral `ImportStage<TRecord, TResult>`
contract and a browser-compatible key-value implementation. Records are first
written below an isolated stage namespace. Live keys are invisible until
commit, promotion is journaled in a small manifest, partial promotion is
removed on failure, and abandoned stages can be discovered and cleaned.

The first implementation intentionally permits promotion only into an empty
target namespace. YNAB4 launcher imports create a new budget, so this avoids
retaining a potentially large rollback snapshot. Overwriting an existing live
budget requires a later copy-on-write generation pointer or a persistence
backend transaction and is rejected rather than performed unsafely.

The production launcher is not switched by this first Milestone 2 increment.
The next integration step is to project each YNAB4 source batch directly into
staged transaction entities, followed by small reference entities and final
budget metadata. Actual Budget will use the same stage lifecycle but a
format-specific archive/SQLite reader and row mapper.

### Direct staged-entity increment

`importYnab4ReaderToStage(...)` maps each bounded source batch with the same
production transaction mapper, accumulates only month/category activity totals
and transaction IDs, serializes replicated transaction entities into the
isolated stage, and releases the batch objects.

After the large collection finishes, the transaction index and small account,
payee, tag, schedule, category, and month projections are staged. Commit
promotes the completed namespace only after every write succeeds. Failures and
cancellation remove partial promotion and staged data.

Reciprocal transfers need no retained pairing table because their canonical
transfer ID is deterministically derived from the two source IDs. The
transaction-ID index remains proportional to transaction count, but is much
smaller than retaining source and canonical transaction object graphs.

The production launcher now uses this path. The synchronous legacy entry point
remains available for focused compatibility tests, but browser imports use the
bounded reader and staged promotion.

### Browser integration readiness

`prepareYnab4PackageEntriesForStreaming(...)` reads `Budget.ymeta`, selects the
active budget data Blob, and deliberately leaves its `text` and `parsedData`
fields empty. A structural regression test uses a Blob whose `text()` method
throws and proves this preparation path never invokes it.

The direct staged importer now reports phase, source rows consumed, persisted
transactions, and persisted batches. Its result reports the maximum canonical
batch size so target-browser diagnostics can assert the configured bound.

The dialog uses lazy package preparation and bounded discovery. Progress comes
from the reader/stage coordinator, and cancellation passes one AbortSignal
through inspection, streaming, persistence, and promotion.

### Streaming preview and staged audit

`discoverYnab4PackageStreaming(...)` now produces the established migration
preview shape without materialising the selected budget. It retains small
reference collections, bounded first/recent transaction samples, bounded
scheduled samples, counts, note samples, and credit-card detection. Tests
compare it with the legacy preview at small batch sizes.

Before promotion, the direct importer reads staged transaction entities one at
a time through a read-only stage view. It verifies transaction count and total
inflow/outflow against aggregates accumulated during mapping. A mismatch aborts
the stage before any live key is written.

Production records written by the streaming path use schema version 2 and store
a compact report: batch size, consumed and persisted counts, maximum canonical
batch size, persisted batch count, and the staged transaction count/inflow/
outflow audit. Version-1 records remain readable and the legacy synchronous
path continues to emit that shape for compatibility tests.

### Large-budget runtime hardening

Metadata inspection and reference-data loading share one cached bounded scan per
reader. Production preflight consumes the same transaction batches that are
mapped into the stage, so validation no longer requires a separate complete
transaction pass. The cache contains only small reference collections and is
released by `close()`.

Automatic version-history snapshots normally serialize a complete second copy
of the active budget. For schema-version-2 streaming YNAB4 imports above 25,000
transactions, automatic full-copy snapshots are skipped to avoid a post-commit
Chrome heap spike. The staged audit and original source remain the immediate
recovery mechanisms; ordinary-size budgets retain existing automatic snapshot
behavior.

Stage manifests store bounded counters rather than transaction-key arrays.
During promotion each staged value is deleted immediately after its live value
is written, preventing simultaneous staged and live copies of the entire
budget. Account entities are read back through the staged view before
promotion. The budget registry entry is prepared off-store and published only
after staged data promotion succeeds, so a browser termination cannot expose a
new empty budget in the selector.

Budget-month entities currently use a repository-wide index rather than a
budget-scoped index. Before staging, the importer seeds its capture store with
the live index so the imported month IDs are merged with IDs belonging to
existing budgets. Promotion grants overwrite permission only to that exact
shared index key. The stage retains its original value until commit completes
and restores it if a later promotion fails; every other pre-existing target
continues to be rejected.

After a completed streaming import, Budget Manager reads the audited
transaction count from the compact import record. It does not enumerate and
decode every transaction merely to render the budget card. Promotion also
releases its transaction-key journal immediately after commit, reducing the
amount of import-only state retained when React renders the completion screen.

For imports above 25,000 transactions, monetary totals come from the bounded
canonical mapping pass and the persistence audit re-reads a deterministic
256-record sample. Promotion still checks that every staged key exists. This
avoids decoding the complete large transaction set once for audit and again
for promotion.

Dashboard and sidebar startup detect large schema-version-2 YNAB4 imports.
They do not eagerly request every account register, because the current
register service materialises the complete transaction repository for each
request. The dashboard displays a bounded-mode notice and the sidebar uses
account metadata until paginated register queries are implemented.

The production local-database backend exposes an optional bulk-mutation
capability. Staging and promotion use it in 500-record transactions, including
canonical operation-journal writes. Previously every staged set, promoted set,
and staged delete opened its own IndexedDB transaction; a large import could
therefore perform hundreds of thousands of serial database transactions.
Fallback key-value implementations retain the original per-key behavior.

Background replication previously built a latest-operation map for every
unreplicated key before pulling a remote batch. Because journal mutations carry
their values, the first replication interval after a large import retained a
second complete transaction dataset and could exhaust Chrome after the bounded
dashboard had already opened. Conflict preparation now scans in bounded
batches and retains only operations whose keys occur in the current remote
batch.

Account entity records are now authoritative for account discovery. The small
account index remains writable for compatibility, but a missing or stale index
after an interrupted replication cycle no longer makes an imported budget
appear to have no accounts.
