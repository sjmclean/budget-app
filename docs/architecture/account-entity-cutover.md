# Account entity cutover

Snapshot 502 moves Account persistence from the aggregate `budget-app.accounts.v1` document to independently addressable replicated entity records.

## Authoritative representation

Each account is stored as a `ReplicatedEntity<AccountEntityFields>` with LWW registers for name, type, starting balance, creation time, and closed time. Deletion writes a tombstone; it does not physically remove the entity record.

The account index is stored at:

`budget-app.entity-replication.v1/account-index`

Individual records use:

`budget-app.entity-replication.v1/account/<encoded-account-id>`

These logical keys are budget scoped by the persistence composition layer and are canonical under the temporary Phase 1 key replication boundary.

## Removed authority

The Account service no longer reads or writes `budget-app.accounts.v1`. There is no dual-read or dual-write migration bridge.

## Integrated paths

The cutover covers normal account CRUD, budget isolation, budget backup and restore, budget lifecycle cleanup, YNAB4 launcher import, Actual Budget launcher import, and YNAB4 import accuracy auditing.

## Temporary transport boundary

The current replication transport still journals canonical storage mutations. It therefore transports each Account entity record independently. A later phase will replace this temporary key transport with domain-level entity operations and merges; the persisted Account representation introduced here remains valid.
