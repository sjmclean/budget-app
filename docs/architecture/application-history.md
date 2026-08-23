# Application history

## Scope and ownership

Application history is an in-memory, per-budget command history. It is not the
persisted domain `commandHistory`/`undoRecords` data and is not saved across an
application reload. The generic stack and keyboard policy remain in
`features/history/undoRedo.ts`. `ApplicationHistoryService` owns one bounded
controller per budget ID; route components only select and observe a stack.

The command context contains the budget ID and the configured persistence
provider. Commands must resolve services from that context when they execute,
undo, or redo. A mounted page, account, or month is never the owner of a stack.

History boundaries are explicit:

- successful backup restore and budget reset clear the affected budget stack;
- successful budget deletion destroys the affected budget stack;
- switching budgets selects another stack without clearing either stack;
- reload naturally discards all stacks.

## Legacy history audit and Phase 2 migration

Before this architecture, `budgetUndoRedo.ts` owned one module-level
`UndoRedoController<BudgetMoneyMovementContext>`. `useBudgetWorkspace` registers
a callback context under `${budgetId}:${month}`. Registration clears history
when that key changes and cleanup clears it on unmount. Consequently history is
Budget-page-owned and cannot survive month, account, or route navigation.

Symbol usage found at the start of this work:

| Symbol | Callers / role |
| --- | --- |
| `useBudgetUndoRedo` | `BudgetPage`, `AccountRegisterPage`, `TopBar`, `ApplicationBar`, `useBudgetKeyboardShortcuts` |
| `registerBudgetUndoRedoContext` | `useBudgetWorkspace` only |
| `UndoRedoController` | generic implementation, budget assignment commands, budget money-movement commands, and the legacy singleton |
| `useUndoRedo` | generic component-local hook with no production caller; deleted in Phase 8 so it cannot create a second domain controller |
| direct persistence mutations | Budget workspace, Account Register, scheduled panel/workflows, account/category/payee/tag/attachment managers, import workflows, and Settings |

Phase 2 removed `budgetUndoRedo.ts` after migrating every production caller.
`BudgetPage`, `AccountRegisterPage`, `TopBar`, `ApplicationBar`, and the global
keyboard hook now observe `useApplicationHistory()`. Assignment, single-source
movement, and multi-source/overspending-cover factories remain Budget-domain
commands; `budgetApplicationHistory.ts` adapts their context and submits them to
the selected budget's application stack. The adapter resolves `budgetView` from
the configured persistence provider on every execute, undo, and redo. It does
not retain a mounted page or its state setters.

The old `flushPendingBudgetEdits()` existed because Assigned edits are applied
optimistically and coalesced for 75 ms before persistence. Undo during that
window would otherwise target the previous persisted state. The replacement is
a general per-budget pending-edit flush registry on `ApplicationHistoryService`.
`useBudgetWorkspace` registers only its flush operation while mounted and
unregisters it without clearing history. Undo/Redo awaits registered editing
surfaces, while the commands themselves continue to use fresh application
persistence context. Unmount cleanup independently persists pending assignment
changes, so no page closure is required after navigation.

The generic keyboard resolver ignores input, textarea, select, and
contenteditable targets, preserving browser-native editable-field Undo. It
supports Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and non-Mac Ctrl+Y.

## Historical migration inventory

“Target” describes the intended end state of this project. “Compound” means a
complete snapshot/restore or atomic multi-record command is required; it must
not be represented by several user-visible entries.

| User action | Entry points / persistence operation | Start state | Target classification | Notes |
| --- | --- | --- | --- | --- |
| Set one or several category assignments | `useBudgetWorkspace`; `setCategoryAssignedValues` | Undoable | Undoable | Existing coalesced edit session and labels must remain. |
| Move assigned money | Budget move/cover menus; `setCategoryAssignedValues` | Undoable | Undoable | Existing single/multiple-source commands. |
| Cover overspending | `useBudgetWorkspace.coverOverspending`; category persistence | Undoable through money movement | Undoable, compound | One entry for every affected source and destination. |
| Set overspending handling | `setCategoryOverspendingHandling` | Not undoable | Undoable | Restore previous handling value. |
| Add transaction | Register editor/import/schedule paths; `addTransaction(s)` | Not undoable | Undoable | Split and transfer graphs make this compound where applicable. |
| Edit transaction | Register editor; `updateTransaction` | Not undoable | Undoable, compound | Snapshot exact persisted graph before and after. |
| Delete one/bulk transactions | selection actions; `deleteTransaction` and batch delete | Not undoable | Undoable, compound | Stable-ID atomic graph restoration required. |
| Clear/unclear transaction | row action; `toggleCleared` / `toggleTransactionCleared` | Not undoable | Undoable | Expected-state validation required. |
| Move transaction(s) between accounts | register selection; `moveTransactions` | Not undoable | Undoable, compound | One label such as `Move 4 transactions`; validate source/target state. |
| Create/edit a split transaction | register editor; transaction add/update with `splitLines` | Not undoable | Undoable, compound | Parent and all split lines form one command. |
| Create/edit/delete a transfer | register editor; transaction writes with transfer linkage | Not undoable | Undoable, compound | Both account-side transactions and linkage restore atomically. |
| Add/edit/delete scheduled transaction | scheduled panel; scheduled persistence port | Not undoable | Undoable | Preserve schedule ID and recurrence state. |
| Enter scheduled transaction | scheduled panel/generation service; add transaction then advance schedule | Not undoable | Undoable, compound | Generated graph and schedule advancement are one atomic command. |
| Create/update/close/reopen account | account modal/settings; account port/query client | Undoable | Undoable | Stable account IDs and exact physical account replacement are implemented. |
| Delete account | account settings; `deleteAccount` | Undoable when empty | Undoable only when exact | SQLite permits deletion only when transaction, schedule and transfer references allow exact row restoration. |
| Create/rename/archive/restore category | Budget workspace; category mutations | Undoable | Undoable | Exact authoritative month state includes group ordering/projection facts. |
| Move category or group | Budget drag/menus; category mutations | Undoable | Undoable | Exact ordering positions are restored. |
| Edit category/group note | Budget workspace; category mutations | Undoable | Undoable | Prior text is restored with the month state. |
| Merge categories | Budget workspace; `mergeCategory` | Not undoable | Intentionally non-undoable initially; compound | Merge redirects transaction, scheduled, assignment, goal, and category references. Enable only with exact reference snapshot. |
| Create group | category creation flow may create/reuse group | Not undoable | Undoable, compound when implicit | Remove an implicitly created group only if still empty and unchanged. |
| Create/update/rename/archive/restore payee | Register payee manager; payee port/query client | Undoable | Undoable | Both management surfaces route ordinary payee changes through application history. |
| Delete unused payee | payee manager/query client | Undoable when unused | Undoable only with exact snapshot | The captured payee includes aliases and recognition rules; physical reference restrictions remain authoritative. |
| Merge payees | payee manager; `mergePayees` | Not undoable | Intentionally non-undoable initially; compound | Redirects transactions, schedules, aliases/rules, tag-like knowledge and suppressions; partial inverse is prohibited. |
| Keep duplicate payees separate | payee manager; duplicate suppression write | Undoable | Undoable | Exact normalized suppression sets are compared and replaced in one SQLite transaction. |
| Create/update/delete/reorder tag | tag manager; `replaceTransactionTags` | Undoable for definitions and unused deletion | Undoable, compound | Full definition-set replacement is one command. In-use deletion is prohibited until assignments are removed through transaction history. |
| Assign/unassign transaction tags | transaction add/edit; `tagIds` | Undoable | Undoable as part of transaction command | Assignment rows are part of the transaction graph. |
| Add attachment | attachment workflow; `addTransactionAttachment` | Undoable | Undoable, compound | Exact transaction graph captures metadata and byte content. |
| Remove attachment | attachment workflow; `removeTransactionAttachment` | Undoable | Undoable, compound | Undo restores bytes, hash, storage metadata, and stable ID. |
| Commit bank import | import dialog/commit engine; `commitImportBatchWithHistory` | Undoable | Undoable, compound | One entry covers additions, matched updates, provenance/source occurrences and created payees. Durable learning is intentionally retained. |
| Commit YNAB4/budget import | import launcher/staging/finalisation | Not undoable | Intentionally non-undoable initially | Whole-budget import/staging is a lifecycle operation, not a register edit. |
| Restore backup | Settings; query client restore or snapshot restore | Not undoable | History boundary | Clear affected stack only after successful restore. |
| Reset budget | Settings; lifecycle reset / key-value reset | Not undoable | History boundary | Clear affected stack only after successful reset. |
| Delete budget | Settings/selector; lifecycle delete | Not undoable | History boundary | Destroy stack only after successful deletion. |
| Rename/update budget metadata | Settings/registry store | Not undoable | Intentionally non-undoable initially | App-shell registry mutation, outside budget data command scope. |
| Change application/device preferences | UI/settings stores | Not undoable | Intentionally non-undoable | Theme, navigation state, import preferences, and similar settings are not budget-domain edits. |
| Import-session draft/reset/selection changes | import session UI/session storage | Not undoable | Intentionally non-undoable | Ephemeral workflow state, not committed budget data. |
| Version-history snapshot creation | budget switch/delete lifecycle | Separate version history | Intentionally non-undoable | Recovery/versioning mechanism, not a user command. |
| Sync, conflict replay, replication, checkpoint and maintenance writes | persistence runtime | Not undoable | Intentionally non-undoable | System-originated effects must not create user history entries. |

## Definitive production mutation coverage matrix

This Phase 8 matrix supersedes the historical target inventory above. The
production entry point is the highest user-facing route; lower persistence
primitives may be called directly only by the named command, system path, or
history boundary. `packages/application` contains server/library application
services but is not the active web mutation entry point except for the imported
read/query contracts and budget-import provider called out below.

| Domain | User action | Production entry point | Persistence mutation | History command | Classification | Atomicity | Conflict protection | Test evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Budget | Edit one or coalesced assignments | `useBudgetWorkspace.updateAssigned` | `setCategoryAssignedValues` | assignment command | **UNDOABLE** | One category-state write | Expected before/after assignments | application-budget history | Pending edits flush before Undo and on unmount. |
| Budget | Move assigned money / cover overspending | Budget move and cover menus | `setCategoryAssignedValues` | single/multi-source movement command | **UNDOABLE** | One compound assignment write | Expected source/destination values | application-budget history | One gesture, one entry. |
| Category | Change overspending handling | `useBudgetWorkspace.setCategoryOverspendingHandling` | category port `setCategoryOverspendingHandling` | `setCategoryOverspendingHandlingCommand` | **UNDOABLE** | Exact budget-month replacement | Whole expected month view | account-category history | Phase 8 closed the final direct Budget mutation bypass. |
| Transaction | Add ordinary/split/transfer transaction | Register save handlers | graph create/capture/delete/restore | `createAddTransactionCommand` | **UNDOABLE** | One Worker transaction for connected graph | Absence and exact graph checks | register history + physical SQLite | Stable parent, split and transfer IDs. |
| Transaction | Edit ordinary/split/transfer transaction | Register edit handlers | graph replacement | `createEditTransactionCommand` | **UNDOABLE** | One Worker transaction | Exact expected graph | register history + physical SQLite | Redo restores captured post-state. |
| Transaction | Clear/unclear one or many | Row/context/selection handlers | graph replacement | toggle/set-cleared commands | **UNDOABLE** | One graph batch | Exact expected graph | register history | No blind toggle on Undo/Redo. |
| Transaction | Delete one or many | Context/selection delete | graph delete/restore | `createDeleteTransactionsCommand` | **UNDOABLE** | One connected-graph transaction | Exact graph/absence checks | register history + physical SQLite | Attachments and transfer counterparts included. |
| Transaction | Move one or many between accounts | Register move handlers | graph replacement | `createMoveTransactionsCommand` | **UNDOABLE** | One graph batch | Exact expected graph | register history | Transfer rows are not offered by this UI. |
| Attachment | Add attachment | `useRegisterAttachmentWorkflow` | transaction graph replacement | `createTransactionGraphChangeCommand` | **UNDOABLE** | Same graph transaction | Expected graph | management history + physical BLOB test | Stable attachment ID, metadata, hash and bytes. |
| Attachment | Remove attachment | `useRegisterAttachmentWorkflow` | transaction graph replacement | `createTransactionGraphChangeCommand` | **UNDOABLE** | Same graph transaction | Expected graph | management history + physical BLOB test | Undo restores exact content. |
| Schedule | Create/edit/delete schedule | `ScheduledTransactionsPanel` via history hook | exact schedule replacement | scheduled create/edit/delete commands | **UNDOABLE** | Exact schedule write | Expected schedule/absence | scheduled history | Stable schedule/split IDs and attachment template. |
| Schedule | Manually enter or skip occurrence | scheduled panel action | combined schedule + transaction graph replacement | `enterScheduledTransactionCommand` | **UNDOABLE** | One SQLite transaction | Both domains checked before write | scheduled history + structural Worker | One compound entry. |
| Account | Create/update/close/reopen | Sidebar/account modal via `useAccountHistory` | account create/update/replacement | account commands | **UNDOABLE** | Exact account row transition | Expected row/absence | account-category history | Stable account ID. |
| Account | Delete empty account | account management via `useAccountHistory` | account delete/replacement | `deleteEmptyAccountCommand` | **UNDOABLE** | Exact row transition | Reference restrictions plus expected state | account-category history | Referenced accounts cannot use this route. |
| Category | Create/rename/archive/restore | Budget workspace via `useCategoryHistory` | category mutation + month replacement | category commands | **UNDOABLE** | Exact budget-month transition | Whole expected month view | account-category history | Stable category and implicit group identities. |
| Category | Move category/group or edit notes | Budget workspace via `useCategoryHistory` | category mutation + month replacement | category move/note commands | **UNDOABLE** | Exact budget-month transition | Whole expected month view | account-category history | Redo never recalculates ordering. |
| Category | Merge categories | Persistence capability; no current `BudgetPage` control | multi-month merge graph | none | **DEFERRED** | Complete atomic contract absent | Complete later-reference validator absent | Phase 7 audit | Transactions, splits, schedules, assignments, goals, ordering and metadata make partial Undo unsafe; no exposed UI currently needs a warning. |
| Payee | Create/update/rename/archive/restore | Register and Payee Management via `usePayeeHistory` | exact payee replacement | payee commands | **UNDOABLE** | Exact payee transition | Expected payee/absence | management history | Aliases/rules included where relevant. |
| Payee | Delete unused payee | Payee Management via history hook | exact payee replacement | `deleteUnusedPayeeCommand` | **UNDOABLE** | Exact row transition | Authoritative reference checks | management history | UI confirmation remains appropriate for deletion. |
| Payee | Keep duplicates separate | Payee Management via history hook | suppression-set replacement | `keepPayeesSeparateCommand` | **UNDOABLE** | One SQLite transaction | Exact normalized set | import history | Never a blind toggle. |
| Payee | Merge payees | Payee Management preview/confirm flow | `mergePayees` compound graph | none | **DEFERRED** | Complete cross-domain restore absent | Complete reference/knowledge validator absent | Phase 7 audit | Rewrites transactions, schedules, aliases/rules, icons, suppressions and recognition state; UI states that it cannot be undone and requires confirmation. |
| Tag | Create/update/rename/archive/reorder or delete unused | `TransactionTagManager` through page history adapter | complete definition-set replacement | tag set commands | **UNDOABLE** | Exact set replacement | Expected definition set | management history | Stable tag IDs. |
| Tag | Assign/unassign tags | Register transaction edit | transaction graph replacement | transaction edit command | **UNDOABLE** | Same graph transaction | Expected graph | register history | Assignment rows are graph children. |
| Tag | Delete assigned tag | Tag manager restriction | definition + assignment graphs | none | **DEFERRED** | Cross-API atomic transition absent | Complete assignment snapshot absent | management history | Partial Undo is unsafe; UI blocks deletion and tells the user to remove assignments first. |
| Import | Commit CSV/QIF/OFX/QFX bank import | `TransactionImportDialog` → import command | `commitImportBatchWithHistory` | `createImportTransactionsCommand` | **UNDOABLE** | Capture and writes in one SQLite transaction | Exact transaction/payee snapshot | import history + source occurrence + graph tests | One entry; Redo restores IDs/provenance without rematching. |
| Import | Persist merchant/payee/category/account learning and format preferences | post-commit learning stage | budget-scoped entity/key-value writes | none | **EXPLICITLY NON-UNDOABLE** | Outside SQLite import transaction | Best-effort, independently validated storage | import knowledge suites | Deliberately durable learning; split synthetic category invariant retained. |
| Import | Edit preview/session/mapping/selection | import dialog/session storage | transient session/preference writes | none | **EXPLICITLY NON-UNDOABLE** | UI/session store | Not budget-authoritative | import session suites | No committed budget mutation. |
| Budget import | Create/import a whole budget (YNAB4/Actual/package) | budget selector import/finalisation | staged database and registry promotion | none | **HISTORY BOUNDARY** | Staged/promoted lifecycle transaction where supported | Import validation and rollback | launcher/import suites | Creates/replaces a budget rather than editing the active stack. |
| Budget lifecycle | Successful backup/package/version restore | Settings restore handlers | restore database/snapshot | none | **HISTORY BOUNDARY** | Restore mechanism owns atomicity | History cleared only after success | import-history + coverage audit structural evidence | Failure retains the stack. |
| Budget lifecycle | Successful reset | Settings reset handlers | `resetBudget` or scoped storage reset | none | **HISTORY BOUNDARY** | Reset mechanism owns atomicity | History cleared only after success | import-history structural evidence | Failure retains the stack. |
| Budget lifecycle | Successful delete | `completeBudgetDeletion` | delete database, scoped data and registry | none | **HISTORY BOUNDARY** | Lifecycle coordinator | Stack destroyed only after completion | import-history structural evidence | Failed/incomplete deletion retains it. |
| Budget registry | Rename/update budget shell metadata | registry/settings flows | registry store write | none | **EXPLICITLY NON-UNDOABLE** | Registry record write | Registry validation | registry suites | Outside budget-domain application history. |
| Preferences | Theme, table layout, collapsed groups, navigation, import preferences | settings/UI hooks | local preference storage | none | **EXPLICITLY NON-UNDOABLE** | Preference record write | Schema/default validation | preference/layout suites | Presentation or workflow configuration, not budget data. |
| Navigation | Route/account/month changes, dialogs, pagination, filters/search/sort, unmount/remount | React/router/view state | no authoritative budget mutation | none | **SYSTEM/AUTOMATIC — NO HISTORY** | Not applicable | Per-budget service ownership | mixed-domain coverage audit | Cannot clear or reorder history. |
| Budget selection | Change active budget | UI registry selection | selected-budget preference | none | **SYSTEM/AUTOMATIC — NO HISTORY** | Preference write | Each budget retains its own controller | application-history tests | Selects, never moves, a stack. |
| Schedule maintenance | Automatic due generation and advancement | maintenance/generation services | lower-level schedule and graph writes | none | **SYSTEM/AUTOMATIC — NO HISTORY** | Worker/domain transaction as implemented | Generation idempotence/provenance | scheduled history + maintenance suites | Not a user gesture; must not pollute Undo. |
| Persistence runtime | Bootstrap/migration/projection repair | provider startup and Worker maintenance | schema/entity/projection writes | none | **SYSTEM/AUTOMATIC — NO HISTORY** | Persistence-owned transactions | Schema/version checks | persistence suites | No user mutation is hidden here. |
| Sync runtime | Replication, conflict replay, checkpoints, outbox/revision/journal | local-first runtime | protocol bookkeeping and replay | none | **SYSTEM/AUTOMATIC — NO HISTORY** | Operation groups/Worker transactions | Conflict protocol | local-first suites | Append-only machinery is not restored user state. |
| Recovery | Automatic version snapshot creation | lifecycle/version service | recovery snapshot write | none | **SYSTEM/AUTOMATIC — NO HISTORY** | Recovery store | Version validation | version-history suites | Recovery mechanism, not an Undo entry. |
| `packages/application` | Repository-backed transaction/category/payee/tag/reconciliation/settings operations | server/library application services; not called by active web mutation UI | repository methods | legacy package-specific facilities | **SYSTEM/AUTOMATIC — NO HISTORY** | Repository transaction policy | Package service validation | package unit suites where present | They are outside the web per-budget controller; importing a type/query contract does not create a second history architecture. |

The audit found no other production React call that mutates authoritative budget
state outside one of these rows. Low-level methods in `useAccountRegister`, the
import engine adapters, persistence clients, and Worker are primitives used by
commands, automatic generation, legacy non-SQLite fallback, or lifecycle
boundaries; they are not additional user-facing Undo controllers.

## Physical SQLite transaction graph audit

`RegisterTransactionView` is not an authoritative history snapshot. The local
SQLite path normalises and mutates more state than that view necessarily carries.
The exact snapshot contract must account for:

- `local_transactions`: parent rows, stable IDs, account, amount/date, cleared,
  transfer linkage, schedule fields, and serialized/import fields;
- `local_split_transaction_lines`: ordered split rows, category data, transfer
  account/transaction linkage, memo, and amount;
- `local_transaction_tag_assignments`: every assignment for each graph member;
- `local_transaction_attachments`: metadata plus the stored content blob;
- import source identity/occurrence records and committed provenance assignments;
- generated-from-schedule ID and occurrence data;
- both transfer counterparts and every cross-reference;
- projection-dirty/cache effects and sync outbox mutations required by the local-first protocol.

The existing worker transaction write, delete, batch-delete, attachment write,
and attachment-delete functions each use `BEGIN IMMEDIATE`/`COMMIT` with rollback
on failure. Transaction delete removes split and tag-assignment rows explicitly;
attachment rows are not a sufficient source of restorable content after removal.
The new capture/restore API therefore belongs at the worker/query persistence
boundary and must perform capture validation and graph restore/delete in one
SQLite transaction while emitting coherent local-first mutations.

No transaction command is considered implemented until real SQLite readback
tests demonstrate parent, split, transfer-pair, tag, attachment bytes, scheduled
provenance, and import provenance preservation as applicable. Fake-port tests
can prove command ordering and failure behavior only.

### Phase 3 findings and contract

The authoritative local-first schema has five transaction-owned tables:

| Table | Ownership and delete behavior |
| --- | --- |
| `local_transactions` | Parent and every ordinary, transfer, scheduled-origin, and timestamp field. |
| `local_transaction_splits` | Children keyed by `(transaction_id, id)`, including category, transfer linkage, memo, and amount. `ON DELETE CASCADE`. No position column exists; persisted order is split-ID order. |
| `local_transaction_tags` | Exact tag assignments. `ON DELETE CASCADE`. |
| `local_transaction_import_provenance` | File type, source identity, occurrence, and imported timestamp. `ON DELETE CASCADE`. Source-occurrence/dedup evidence is derived from these rows. There is no separate active native-bank provenance or transaction-fingerprint table; OFX/QFX are represented here. |
| `local_transaction_attachments` | Metadata, hash, and actual BLOB bytes. `ON DELETE CASCADE`. The authoritative local-first path has no external attachment content store. |

The parent stores `generated_from_schedule`, `scheduled_transaction_id`, and
`scheduled_occurrence_date`. Transfers are two parents with reciprocal
transaction/account links; split rows can also link to transfer transactions.
Capture walks outgoing and incoming parent/split transfer links so a requested
ID expands to its complete connected graph, including legacy asymmetric links.

`TransactionHistorySnapshot` is deliberately not `RegisterTransactionView`. It
contains authoritative `LocalTransactionRecord` rows plus attachment metadata
and copied bytes. Capture fails for missing requested or linked records.
Canonical comparison checks every stored field and byte while sorting parents,
splits, tags, provenance, and attachments deterministically.

The worker exposes bulk-capable capture, delete, and restore requests. Delete
rejects a graph that differs from its expected snapshot. Restore requires every
parent ID to be absent, preserves IDs, and makes repeated restore fail instead
of overwriting later data. It restores parents, splits, tags, provenance, and
attachment BLOBs in one `BEGIN IMMEDIATE` transaction, then recaptures and
compares before `COMMIT`; every failure executes `ROLLBACK`.

The local-first client emits one operation group for all transaction and
attachment mutations. SQLite revisions, outbox IDs/sequences, projection-dirty
rows, and mutation timestamps are regenerated persistence machinery.
Transaction `updated_at`, attachment timestamps, and import timestamps are
identity-bearing snapshot fields and restore exactly.

Phase 3 tests execute capture, cascade delete, restore, authoritative readback,
duplicate rejection, and forced rollback against physical `better-sqlite3`
using the same local register schema. They also assert the sqlite-wasm worker's
transaction wrapper, recapture, comparison, commit, and rollback wiring. This
is physical SQLite schema/readback evidence, but not execution inside a browser
OPFS sqlite-wasm Worker; that remains a separate end-to-end layer.

### Phase 4 Register command routing

Normal user-facing Register mutations now enter through
`useRegisterTransactionHistory` and the command factories under
`history/commands/transactions`. The audited routes are:

| UI route | Command path |
| --- | --- |
| Entry row Save / Save and add another, including another target account | `createAddTransactionCommand` |
| Inline edit and tag assignment edit | `createEditTransactionCommand` |
| Row/context clear toggle | `createToggleTransactionClearedCommand` |
| Selection-bar clear/unclear | one `createSetTransactionsClearedCommand` for all selected IDs |
| Selection/context delete | one `createDeleteTransactionsCommand` for all selected IDs |
| Selection/context move | one `createMoveTransactionsCommand` for all selected IDs |

Desktop, responsive rows, context menus, and selection controls feed these same
page-level handlers; transaction row components do not own persistence or Undo.
The hook only plans IDs and submits commands. Command execute/undo/redo resolves
the current query service from `ApplicationHistoryContext` and stores no React
setter, visible row, sort position, or refresh callback. Persistence mutation
notifications reload any mounted Register.

Imports (`addTransactions`, import batch updates) remain intentionally direct
and non-undoable until the import compound-command phase. Scheduled Enter uses
the explicitly named `addTransactionWithoutHistory` route until scheduled
generation and schedule advancement can be one command. Attachment add/remove
management and account/payee/category/tag-definition management remain later
coverage; deleting a transaction with an existing attachment is fully covered
because the attachment BLOB is part of its graph snapshot.

Add plans the source transaction ID before execution. A created transfer's
counterpart is captured after persistence, so Undo/Redo preserves both IDs.
Delete captures and deduplicates the connected graph before one atomic graph
delete. Bulk selection IDs that belong to one transfer graph therefore do not
duplicate restoration. Redo uses the same expected snapshot.

Edit, clear/unclear, and move capture authoritative before and after graphs.
Undo uses atomic `replaceTransactionHistorySnapshot(expected: after,
replacement: before)`; redo reverses those arguments. The worker compares the
current graph before replacing it, so an external or later incompatible write
fails without changing persistence. The generic controller retains a failed
command on Undo and does not alter redo. `useApplicationHistory` surfaces the
failure through the application alert/toast host.

Splits remain children of one parent command and stable split IDs round-trip.
Transfer add, edit, and delete commands expand to the full linked graph,
including counterpart IDs, directions, account linkage, tags, provenance, and
attachments. The existing selection UI still excludes transfer rows from Move;
there was no user-facing transfer-move route to migrate in this phase. Supported
moves use account identity, never UI ordering. Import provenance stays in every
before and after snapshot, so ordinary edit/delete Undo does not erase future
deduplication evidence.

Command tests use an authoritative identity-keyed persistence harness and prove
labels, one-entry bulk behavior, stable IDs, compound graph restoration,
conflict refusal, global Budget/Register ordering, and survival without a
mounted consumer. Phase 3 remains the physical `better-sqlite3` schema/BLOB and
rollback evidence. Source wiring tests are not DOM/browser event tests, and the
browser OPFS Worker remains outside the Node test environment.

### Phase 5 scheduled transaction command routing

User-initiated scheduled mutations now enter through
`useScheduledTransactionHistory` and the factories under
`history/commands/scheduled`:

| UI action | History command |
| --- | --- |
| Save a new schedule | `createScheduledTransactionCommand` |
| Save an edited schedule | `editScheduledTransactionCommand` |
| Confirm schedule deletion | `deleteScheduledTransactionCommand` |
| Enter or skip the current occurrence | `enterScheduledTransactionCommand` |

The panel remains a form/view layer. It does not call scheduled create, update,
delete, advance, or Register Add persistence methods. Commands plan stable
schedule and occurrence transaction IDs and resolve current persistence services
from `ApplicationHistoryContext`. Payee-management reference rewrites remain part
of the later payee-management phase rather than a parallel scheduled history
path.

Schedules are captured as their complete authoritative JSON entity from
`local_scheduled_transactions`. This includes recurrence kind and rule,
specific instalments and index, occurrence counters, weekend and end policies,
stable split IDs, transfer account identity, tags, and attachment-template
content. Create captures the exact resulting entity; edit stores authoritative
before and after entities; delete stores the exact entity before removal. Undo
and Redo compare the expected persisted entity before replacement.

Manual Enter is one cross-domain command. It plans the deterministic occurrence
transaction ID, derives the normal Register write from the captured schedule,
advances or completes the schedule, and submits both the resulting Register
graph and schedule state to one Worker transaction and one logical outbox group.
It never calls the public undoable Register Add command, so no nested history
entry is created. Generated transfers include both reciprocal transaction IDs;
splits, tags, and copied attachment bytes are carried in the Phase 3 transaction
graph snapshot.

Undo Enter first validates both the expected generated graph and expected
post-Enter schedule state inside `BEGIN IMMEDIATE`, then deletes the graph and
restores the pre-Enter schedule. Redo performs the inverse using the same IDs and
bytes. A one-time or terminal specific-date schedule uses `null` as its exact
post-state. A skipped weekend occurrence has no generated graph but still stores
and reverses its schedule progression. Any mismatch rolls back both domains and
the application-history controller retains the failed entry.

Automatic due generation in `scheduledTransactionMaintenance` and
`scheduledTransactionGenerationService` deliberately continues to use the
lower-level persistence boundary. It does not execute an application-history
command and therefore cannot pollute the user's Undo stack.

Scheduled command tests use an authoritative identity-keyed adapter for command
semantics and navigation/global ordering. Worker source-contract tests prove the
combined precondition checks, transaction boundary, attachment write, readback,
commit, and rollback wiring. Phase 3 supplies physical `better-sqlite3`
transaction graph/BLOB evidence; recurrence/lifecycle tests exercise the real
schedule model. Browser OPFS Worker and DOM event execution are not claimed.

### Phase 7 committed import history

The production import pipeline is `TransactionImportDialog` →
`commitImportSession` → its single `commitTransactionBatch` adapter →
`createImportTransactionsCommand` → `commitImportBatchWithHistory` → the
local-first client/Worker. Preview, mapping, reconciliation, verification and
session bookkeeping remain non-authoritative UI workflow and create no history
entry. Public Add/Edit history commands are not called by the compound command.

The audited successful SQLite mutation graph is:

| Physical state | Import effect | Snapshot policy |
| --- | --- | --- |
| `local_transactions` | New rows and matched-existing row changes, including date, memo, category, cleared state, raw/canonical payee and schedule/transfer fields | Exact before/after graph |
| `local_transaction_splits` | Imported or edited split children with stable IDs and allocation | Owned by transaction graph |
| Transfer parents/split links | Reciprocal transactions when supported by the prepared import plan | Capture walks the complete connected graph |
| `local_transaction_tags` | Tags retained or changed on matched rows | Owned by transaction graph |
| `local_transaction_attachments` | Imports currently do not create attachments, but existing matched-graph attachment metadata and BLOB bytes are captured | Owned by transaction graph |
| `local_transaction_import_provenance` | CSV/QIF/OFX/QFX identity, occurrence and import timestamp for additions and matches | Exact graph state; duplicate/source-occurrence evidence is derived from these rows |
| `local_payees`, aliases and rules | Staged payees created by the import | Exact import-owned payee state |
| projection-dirty rows, revision and outbox | Sync/projection machinery for forward and inverse mutations | Regenerated append-only machinery, not restored user state |

`ImportHistorySnapshot` stores stable transaction roots and created-payee IDs
plus the exact authoritative objects present in the pre- or post-state. Its
transaction member is a `TransactionHistorySnapshot`, including connected
transfers, split rows, tags, provenance and attachment bytes. An additions-only
pre-state may contain no transaction rows; matched rows remain present in both
states. Redo replaces the pre-state with the captured post-state and never
reruns parsing, matching, reconciliation, payee resolution, or ID generation.

Undo and Redo compare every tracked graph and payee before writing. The Worker
performs graph deletion, payee upsert/deletion, graph restoration and recapture
verification in one `BEGIN IMMEDIATE` transaction. A later edit to a tracked
transaction or transfer member rejects the operation. Before deleting an
import-created payee, the Worker checks all remaining transaction and scheduled
references. A later manual reference therefore makes Undo fail safely; the
history entry and later data remain intact. Every failed precondition or
verification rolls back the compound transition.

Undo removes provenance rows, so importing the same file afterward follows the
normal no-provenance duplicate path. Redo restores the exact identities and
occurrence numbers; importing the file afterward again sees the original source
evidence. This applies equally to CSV, QIF and OFX/QFX strong identities.

Merchant normalization, alias/category/account learning and CSV/QIF format
preferences live in budget-scoped key-value/entity storage and are persisted
after the SQLite commit as explicitly best-effort learning. They cannot share
the SQLite atomic boundary and are intentionally durable across Import Undo.
The rule that split imports do not teach the synthetic `Split` name or
child-category merchant learning remains in `learnFromCommittedCandidates`.
Import audit diagnostics and recent-import UI activity are observational/session
state and are not reversed.

### Phase 7 deferred compound-mutation audit

| Action | Physical graph and atomicity assessment | Decision |
| --- | --- | --- |
| Category merge | Deletes/recreates source/target category facts across every budget month; rewrites parent and split transaction category references, schedules, assignments/goals, group ordering/archive/note metadata, projection facts and outbox state. A complete multi-month graph and later-reference validator do not yet exist. | **Defer.** High implementation size and risk; source-category-only recreation is prohibited. |
| Payee merge | Rewrites source/target payee rows, aliases, recognition rules, icons, transaction and schedule references, duplicate suppressions and merge knowledge. No exact cross-domain readback contract covers every member or later reference. | **Defer.** High risk; a partial inverse would corrupt recognition/reference state. |
| Keep duplicate payees separate | One normalized set in `local_payee_duplicate_suppressions` on the authoritative path. Exact comparison, replacement and readback fit one SQLite transaction. | **Implemented in Phase 7.** One `Keep payees separate` history entry. |
| Delete assigned tag | Requires the exact tag definition plus every affected transaction graph and assignment row. Definitions and assignments currently cross separate persistence APIs, so one atomic transition is unavailable. | **Defer.** Remove assignments through undoable transaction edits before deleting the unused tag. |

Restore, reset and delete remain history boundaries rather than commands.
Settings clears the affected budget stack only after a successful portable,
SQLite, package, version-history restore or reset. Shared budget deletion calls
`applicationHistory.destroy(budgetId)` only after authoritative deletion and
registry removal succeed. Failed lifecycle operations retain history.

## Command rules

- One user gesture creates one history entry.
- Commands carry stable IDs and descriptive labels.
- Undo and redo validate the expected current state before overwriting or
  deleting data; a failed validation leaves the stack entry in place.
- Compound effects are committed or rolled back together at the SQLite boundary.
- Executing a new command clears redo through the generic controller.
- History remains bounded by the generic controller's configured maximum.
- Direct persistence calls remain permitted only for actions classified above
  as intentionally non-undoable or as history boundaries.

## Migration checkpoints

1. **Complete:** introduce application history ownership and isolation tests.
2. **Complete:** move assignment and money-movement commands and all
   toolbar/shortcut callers, then delete `budgetUndoRedo.ts`.
3. **Complete:** add exact SQLite transaction graph capture/restore contracts
   and physical readback tests.
4. **Complete:** route normal Register mutations through validated
   application-history commands.
5. **Complete:** add scheduled transaction commands, including compound Enter.
6. **Complete:** extend safe reversible coverage to accounts, categories/groups,
   ordinary payee and tag management, and attachments; keep unsafe merges
   explicitly deferred.
7. **Complete:** make committed bank imports exact compound commands, implement
   duplicate-suppression replacement, audit destructive deferrals, and wire
   restore/reset/delete history boundaries.
8. **Complete:** exhaustively classify production mutations, route overspending
   policy changes through category history, remove the unused component-local
   controller hook and obsolete import row-adapter props, and add mixed-domain
   orchestration/source audit evidence.
