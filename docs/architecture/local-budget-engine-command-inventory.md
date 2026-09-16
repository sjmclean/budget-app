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

## Final dispositions

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

All 47 ordinary entry points in the operation matrix are typed
`LocalBudgetEngine` methods and execute through `LocalBudgetCommandExecutor`.
Their domain return values are preserved, while the executor internally creates
the public result envelope from an explicit `CommittedCommandHandlerResult` and
owns the single local publication. `LocalBudgetMutationContext` allocates
replication metadata; it no longer acts as the executor's completion result.

| Original family | Final disposition |
| --- | --- |
| Transaction create/update/delete/move/clear | Engine command; grouped transfer members share one executor completion |
| Transaction and import batch | Engine batch command; existing bounded atomic worker request retained |
| Attachments | Engine command for replicated metadata and bytes; binary read remains query-only |
| Accounts | Engine command, including exact history replacement |
| Budget month and category | Engine command; carry-forward impact is retained |
| Category goals | Engine command; persistence helper records committed impact only |
| Payees | Engine command; merge and suppression retain atomic worker primitives |
| Transaction tags | Engine command and exact history command |
| Scheduled transactions | Engine command; materialisation remains one grouped logical command |
| History operations | Engine command using specialised atomic worker primitives |
| Conflict keep-local | Engine-executed replay; accept-remote remains replication-owned |
| Remote apply | Replication exception; never creates local outbox rows |
| Restore/reset/open/close/baseline replacement | Lifecycle exception |

There are no unresolved ordinary-write dispositions.
