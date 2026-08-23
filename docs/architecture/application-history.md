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
| `useUndoRedo` | exported generic component-local hook; no production caller |
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

## Persistent mutation inventory

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
| Create/update/close/reopen account | account modal/settings; account port/query client | Not undoable | Undoable | Account creation can also create opening-balance transaction and credit-card payment category, so use exact effects. |
| Delete account | account settings; `deleteAccount` | Not undoable | Undoable only when exact | SQLite currently permits deletion only when references allow it; capture all account side effects. |
| Create/rename/archive/restore category | Budget workspace; category mutations | Not undoable | Undoable | Includes group ordering/projection facts touched by mutation. |
| Move category or group | Budget drag/menus; category mutations | Not undoable | Undoable | Restore exact ordering positions. |
| Edit category/group note | Budget workspace; category mutations | Not undoable | Undoable | Restore prior text. |
| Merge categories | Budget workspace; `mergeCategory` | Not undoable | Intentionally non-undoable initially; compound | Merge redirects transaction, scheduled, assignment, goal, and category references. Enable only with exact reference snapshot. |
| Create group | category creation flow may create/reuse group | Not undoable | Undoable, compound when implicit | Remove an implicitly created group only if still empty and unchanged. |
| Create/update/rename/archive/restore payee | Register payee manager; payee port/query client | Not undoable | Undoable | Rename also updates register and scheduled references. |
| Delete unused payee | payee manager/query client | Not undoable | Undoable only with exact snapshot | Aliases and recognition rules are physically deleted too. |
| Merge payees | payee manager; `mergePayees` | Not undoable | Intentionally non-undoable initially; compound | Redirects transactions, schedules, aliases/rules, tag-like knowledge and suppressions; partial inverse is prohibited. |
| Keep duplicate payees separate | payee manager; duplicate suppression write | Not undoable | Undoable | Restore suppression set exactly. |
| Create/update/delete/reorder tag | tag manager; `replaceTransactionTags` | Not undoable | Undoable, compound | Replacement writes the full definition set; assignments must remain valid. |
| Assign/unassign transaction tags | transaction add/edit; `tagIds` | Not undoable | Undoable as part of transaction command | Assignment rows are part of the transaction graph. |
| Add attachment | attachment workflow; `addTransactionAttachment` | Not undoable | Undoable, compound | Snapshot metadata and byte content. |
| Remove attachment | attachment workflow; `removeTransactionAttachment` | Not undoable | Undoable, compound | Undo must restore actual bytes, hash, storage metadata, and stable ID. |
| Commit bank import | import dialog/commit engine; `commitImportBatch` or batch mutations | Not undoable | Deferred unless exact compound command is implemented | One entry covering additions, matched updates, provenance occurrences, and payee creations. Never one entry per row. |
| Commit YNAB4/budget import | import launcher/staging/finalisation | Not undoable | Intentionally non-undoable initially | Whole-budget import/staging is a lifecycle operation, not a register edit. |
| Restore backup | Settings; query client restore or snapshot restore | Not undoable | History boundary | Clear affected stack only after successful restore. |
| Reset budget | Settings; lifecycle reset / key-value reset | Not undoable | History boundary | Clear affected stack only after successful reset. |
| Delete budget | Settings/selector; lifecycle delete | Not undoable | History boundary | Destroy stack only after successful deletion. |
| Rename/update budget metadata | Settings/registry store | Not undoable | Intentionally non-undoable initially | App-shell registry mutation, outside budget data command scope. |
| Change application/device preferences | UI/settings stores | Not undoable | Intentionally non-undoable | Theme, navigation state, import preferences, and similar settings are not budget-domain edits. |
| Import-session draft/reset/selection changes | import session UI/session storage | Not undoable | Intentionally non-undoable | Ephemeral workflow state, not committed budget data. |
| Version-history snapshot creation | budget switch/delete lifecycle | Separate version history | Intentionally non-undoable | Recovery/versioning mechanism, not a user command. |
| Sync, conflict replay, replication, checkpoint and maintenance writes | persistence runtime | Not undoable | Intentionally non-undoable | System-originated effects must not create user history entries. |

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
4. Route Register mutations through validated application-history commands.
5. Add scheduled transaction commands, including compound Enter.
6. Extend safe reversible coverage to accounts, categories/groups, payees, tags,
   and attachments; keep unsafe merges explicitly non-undoable.
7. Wire lifecycle history boundaries, re-run the mutation audit, and remove dead
   legacy paths.
