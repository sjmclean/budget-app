# Operations and Recovery

Operational workflows must preserve financial data integrity and make state
replacement explicit.

## Budget deletion

Deletion must remove authoritative local and hosted representations so a
deleted budget cannot reappear after reload or synchronization.

Deletion workflows must also clear stale selection, registry, synchronization,
and catalogue state associated with the removed budget.

## Backup and restore

Backups represent complete recoverable budget state.

Restore is not an ordinary stream of incremental mutations. Replacing the
authoritative present must prevent newer pre-restore history from replaying over
the restored state.

Restore workflows should:

1. validate the backup;
2. create a pre-restore safety point where appropriate;
3. replace authoritative state atomically;
4. reset incompatible synchronization state;
5. establish the synchronization history that follows the restored state.

## Version history

Historical restore points should remain conceptually separate from ordinary
replication baselines.

Replication exists to synchronize current state. Version history exists to let
the user deliberately return to an earlier state.

## Diagnostics

Persistence and synchronization failures should expose enough information to
identify:

- active budget;
- persistence initialization state;
- sync epoch;
- baseline or mutation failure;
- local database integrity problems;
- server relay failures.

Diagnostics should avoid becoming another persistence mechanism.

## Server storage

Operational maintenance must distinguish active local-first relay data from
retired replication infrastructure.

Large historical or compatibility tables should not be retained indefinitely
when they are no longer part of the runtime architecture.
