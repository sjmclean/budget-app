# Account reconciliation — write-path audit and phase 1 contract

Status: initial audit of `master` following PR #123. No reconciliation completion command is implemented yet.

## Accepted semantics

- `uncleared` and `cleared` remain independently user-editable states.
- Clicking the Clear control **never** marks a transaction reconciled.
- `reconciled` is assigned only by a successful, explicit account reconciliation completion operation.
- Reconcile one account at a time. A transfer's other account does not become reconciled automatically.
- Never silently create an adjustment to force the account balance to match a statement.

## Existing implementation inventory

| Path | Current behavior | Phase 1 action |
| --- | --- | --- |
| `registerSchema.ts` | `local_transactions.cleared_status` persists status | Retain single authoritative status field; add validation for recognized values if appropriate |
| `TransactionRow.tsx` | Cleared toggle; reconciled shows noninteractive R | Preserve behavior |
| `useAccountRegister.ts` | Maps `cleared` and `reconciled` to cleared balance/UI; separately identifies `reconciled` | Reuse existing query |
| `localBudget.worker.ts` account summary | Both cleared and reconciled count toward cleared balance | Reuse existing calculation including opening balance |
| `engine/transactionCommandHelpers.ts` | `requireMutableTransaction` blocks reconciled edits; linked transfer updates check counterpart | Keep and test |
| `engine/transactionCommands.ts` | Toggle and bulk clear call `requireMutableTransaction`; update and delete use the same guard | Keep and test |
| `engine/transactionHistoryCommands.ts` | Snapshot restore/delete/replace and import-history commands are separate write paths | Audit for reconciled status conflicts before enabling reconciliation |
| `localBudget.worker.ts` | Remote mutation application and history snapshot replacement write SQLite independently | Verify protections and replica semantics in integration tests; do not blindly block legitimate remote reconciliation changes |
| `engine/transactionCommandHelpers.ts` import preparation | Existing import updates call `requireMutableTransaction` | Add regression coverage for reconciled imports |
| `register-delta.spec.ts` | Covers clearing, patches, undo/redo, moves and import refresh | Extend with reconciliation tests |

## Unresolved correctness risks before enabling completion

1. History snapshot deletion/replacement can affect reconciled rows even though ordinary edit commands reject them. Determine whether an undo created before reconciliation may remove a now-reconciled transaction; require a clear conflict response rather than silently altering it.
2. Replication must carry an explicit reconciliation transition and handle concurrent edits correctly. Rejecting **all** remote edits to reconciled transactions could prevent legitimate multi-device synchronization; design conflict checks at the authoritative command level.
3. Import/update must not overwrite reconciled state, including imports with transaction-history snapshots.
4. Split and transfer updates must preserve independent account reconciliation state. Reconcile parent transactions, not split child rows individually.
5. Reconciliation needs an atomic, SQLite-authoritative completion operation that validates the statement date, statement balance (integer minor units), selected eligible cleared transactions, account ownership, and computed cleared balance *within the same transaction*.
6. Successful completion should store a durable reconciliation checkpoint (account, statement date and amount, completed timestamp, transaction IDs/version), with an explicit reversal/correction policy. Changing cleared flags alone does not provide an audit trail.
7. Completion must publish existing mutation events and Register refresh/patch metadata only **after** commit. A failed mismatch must leave all statuses unchanged.
8. Avoid loading an entire large Register in the browser just to compute or complete reconciliation.

## Proposed implementation sequence

1. Define a reconciliation checkpoint and a completion request/response contract; decide whether existing transaction-history infrastructure can represent reconciliation reversal safely.
2. Add worker-level atomic validation, mismatch rollback, and mutations/checkpoint persistence.
3. Add tests covering successful completion, wrong statement balance, different account, future/invalid date, uncleared exclusion, transfer counterpart independence, split handling, failures and sync.
4. Add account Register modal with statement balance/date, displayed difference, review of cleared transactions, and explicit Finish Reconciliation button enabled only at zero difference.
5. Follow with correction/reversal UI and history.

**Do not merge a UI that offers Finish Reconciliation until the write-path and history invariants above are tested.**
