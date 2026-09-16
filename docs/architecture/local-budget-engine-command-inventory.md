# Local Budget Engine command-boundary inventory

This inventory records the P0.3 pre-migration write architecture from the local
worktree. It is intentionally based on the current SQLite implementation rather
than the historical hosted provider.

## Counts before migration

- Ordinary local facade write/history/conflict entry points: **47**.
- Write-like `LocalBudgetWorkerRequest` variants: **41** (including lifecycle,
  replication, and staging operations that are not ordinary commands).
- Feature-visible mixed read/write interface: **1**
  (`AccountRegisterQueryClient`).
- Ordinary mutation-envelope factory sites: **1** (`mutation()` in
  `localFirstAccountRegisterClient.ts`), called throughout the facade.
- Ordinary local post-commit publication sites: **28**.
- Intentional non-command paths: remote mutation application, conflict
  accept-remote, baseline/restore/generation replacement, staged whole-database
  import, database open/close/delete, baseline export, and outbox acknowledgement.

## Pre-migration operation matrix

| Operation | Current public caller | Current facade method | Worker/client write | Envelope creation | Invalidation | History/conflict |
| --- | --- | --- | --- | --- | --- | --- |
| Transaction create/update/delete/move/clear | Register hooks and transaction history commands | `addTransaction`, `updateTransaction`, `deleteTransaction`, `moveTransactions`, clear methods | transaction write/delete and batch requests | facade `mutation()` plus transaction builders | facade transaction-impact helpers | snapshot restore/delete/replace use specialised atomic requests |
| Transaction/import batch | Register import engine and import history | `commitTransactionBatch`, `commitImportBatch*` | `writeTransactionBatch`, `writeImportBatch*` | facade batch builders | facade unions committed mutations | import snapshot replacement is atomic |
| Transfer pair | Transaction facade | transaction create/update/delete paths | grouped transaction batch | facade creates one operation group and member mutations | old/new pair impact union | replay rejects one-sided linked transfers |
| Attachments | Register attachment UI | add/remove attachment | attachment write/delete | facade `mutation()` | facade attachment/transaction scope | content read remains a query/specialised binary path |
| Accounts | Sidebar/account history | create/update/close/delete and account history replacement | account write/delete/history replacement | facade `mutation()` | facade account/budget scope | history request validates expected state |
| Budget month/category | Budget workspace and category history | assignments, category mutation, month history replacement | generic mutation batch, category merge, month replacement | facade `mutation()` | facade category/month scope | month replacement is atomic |
| Category goals | Goal UI/history | goal create/update/delete/history replacement | goal-specific worker requests | facade `mutation()` | `commitCategoryGoalMutation` publishes | history expected/replacement request |
| Payees | Payee management/register/history | create/update/archive/delete/merge/separate/history | payee write/delete/merge/suppression requests | facade `mutation()` | facade payee plus linked-domain scope | merge is atomic; history validates expected state |
| Transaction tags | Settings/history | replace tags/history | generic mutate batch/history request | facade `mutation()` | facade tag/transaction scope | history expected/replacement request |
| Scheduled transactions | Scheduled UI/maintenance/history | create/update/delete/advance/enter/reference rewrites/history | generic mutate batch and schedule-history request | facade `mutation()` | facade schedule/transaction scope | materialisation groups schedule and transaction changes |
| Conflict keep-local | Conflict UI | `resolveSyncConflict` | domain-specific replay plus conflict resolution | replay reuses losing mutation metadata | facade publishes after commit | keep-local writes outbox; accept-remote does not |

## Lifecycle and replication exceptions

The command boundary must not absorb database open/close, baseline export or
replacement, restore-point promotion, uploaded whole-database restore, staged
YNAB/Actual database import, sync-epoch reset, database-file retirement, remote
mutation application, or outbox acknowledgement. These are control-plane or
replication operations and retain their existing broad/remote invalidation
semantics.

## Migration target

```text
feature/application intent
  -> LocalBudgetEngine command
  -> domain command handler
  -> LocalBudgetDatabaseClient internal RPC
  -> atomic SQLite canonical rows + outbox
  -> LocalBudgetCommandResult
  -> one post-commit scoped publication
```

Queries remain a separate path through a read-only local budget query client.
`LocalBudgetMutation` remains an internal replication/persistence format and is
not an application command.

## Current checkpoint: routing versus physical extraction

### Public routing

All 47 ordinary entry points in the operation matrix are typed
`LocalBudgetEngine` methods and execute through `LocalBudgetCommandExecutor`.
This is a routing statement only: it does not mean that every implementation
has moved out of `localFirstAccountRegisterClient.ts`.

### Physical domain extraction

- Transactions and transfers: complete in `engine/transactionCommands.ts` and
  `engine/transactionCommandHelpers.ts`.
- Accounts: complete in `engine/accountCommands.ts`.
- Transaction tags: complete in `engine/tagCommands.ts`.
- Attachments: complete in `engine/attachmentCommands.ts`.
- Budget months and categories: complete in
  `engine/budgetCategoryCommands.ts` and `engine/categoryCommandHelpers.ts`.
- Still runtime-owned: goals, payees, scheduled transactions, remaining
  history/import commands, and keep-local conflict replay.

The runtime-owned families are routed through the engine/executor boundary but
have not yet been physically extracted into domain command modules.

## Extracted dispositions

### Extracted transaction handlers

| Command | Final module | Final handler |
| --- | --- | --- |
| Transaction create | `engine/transactionCommands.ts` | `addTransaction` |
| Transaction update, including linked-transfer updates | `engine/transactionCommands.ts` | `updateTransaction` |
| Transaction delete, including atomic reciprocal-transfer deletion | `engine/transactionCommands.ts` | `deleteTransaction` |
| Transaction batch commit | `engine/transactionCommands.ts` | `commitTransactionBatch` |
| Transaction account move, including linked transfers | `engine/transactionCommands.ts` | `moveTransactions` |
| Toggle cleared state | `engine/transactionCommands.ts` | `toggleTransactionCleared` |
| Set cleared state batch | `engine/transactionCommands.ts` | `setTransactionsCleared` |

Shared canonical-record construction, reciprocal-transfer validation, and
operation-group write builders live in `engine/transactionCommandHelpers.ts`;
batch preparation lives there as well. All ordinary transaction and transfer
commands are now owned by `engine/transactionCommands.ts`; the runtime only
wires mutation allocation and infrastructure dependencies.

### Extracted account handlers

| Command | Final module | Final handler |
| --- | --- | --- |
| Account create | `engine/accountCommands.ts` | `createAccount` |
| Exact account history replacement | `engine/accountCommands.ts` | `replaceAccountHistoryState` |
| Account metadata/type/participation update | `engine/accountCommands.ts` | `updateAccount` |
| Account close or reopen | `engine/accountCommands.ts` | `setAccountClosed` |
| Empty-account deletion | `engine/accountCommands.ts` | `deleteAccount` |

Account capture and account navigation remain query operations. Reconciliation
continues to be transaction-owned. All ordinary account writes, account record
construction, and account impact selection are owned by
`engine/accountCommands.ts`.

### Extracted budget/category handlers

| Command | Final module | Final handler |
| --- | --- | --- |
| Category assignment batch | `engine/budgetCategoryCommands.ts` | `setCategoryAssignedValues` |
| Category create/rename/archive/policy/note/reorder/merge | `engine/budgetCategoryCommands.ts` | `mutateCategory` |
| Exact budget-month history replacement | `engine/budgetCategoryCommands.ts` | `replaceBudgetMonthHistoryState` |

Category state transformation and category/group positioning live in
`engine/categoryCommandHelpers.ts`. Category goals remain runtime-owned and are
not part of this extraction.

Their domain return values are preserved. At this checkpoint, domain operations
record mutation IDs and change impact in command-scoped contexts;
`createDomainCommandHandler` converts that recorded state into a
`CommittedCommandHandlerResult`, and the executor owns the single local
publication. Direct committed metadata returns from every domain handler remain
the P0.3e4 target after the transitional recorder is removed.

| Original family | Public routing | Physical implementation owner |
| --- | --- | --- |
| Transaction create/update/delete/move/clear | Engine/executor | Extracted transaction modules |
| Transaction batch | Engine/executor | Extracted transaction modules |
| Import batch and remaining import history | Engine/executor | Runtime-owned |
| Attachments | Engine/executor | Extracted attachment module; binary read remains query-only |
| Accounts | Engine/executor | Extracted account module, including exact history replacement |
| Budget month and category | Engine/executor | Extracted budget/category modules |
| Category goals | Engine/executor | Runtime-owned |
| Payees | Engine/executor | Runtime-owned |
| Transaction tags | Engine/executor | Extracted tag module |
| Scheduled transactions | Engine/executor | Runtime-owned |
| Remaining history operations | Engine/executor | Runtime-owned |
| Conflict keep-local | Engine/executor | Runtime-owned; accept-remote remains replication-owned |
| Remote apply | Replication exception; never creates local outbox rows |
| Restore/reset/open/close/baseline replacement | Lifecycle exception |
