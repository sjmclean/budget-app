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

Both uploaded SQLite backups and internal restore points:

1. validate the backup;
2. create a pre-restore safety point where appropriate;
3. replace authoritative state atomically;
4. clear the candidate image's device-owned outbox and conflicts, reset its
   cursor/baseline pointer, and assign a fresh synchronization epoch;
5. stage the complete restored image at the relay and durably record the pending
   transition before the owner-authorized relay commit;
6. publish the local database generation only after the relay makes that restored
   image the baseline at cursor zero in the new epoch.

If relay publication is interrupted after the durable transition record is
written, the budget is quarantined instead of synchronizing against its former
epoch. Startup retries the idempotent relay confirmation and local publication.
Failure before that record leaves the previous local generation authoritative.

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


## Development service

The current development stack is managed by the `budget-app-dev` systemd user
service. User lingering is enabled for the development account, so the service
does not depend on an open SSH/PuTTY session.

Common commands:

```bash
systemctl --user status budget-app-dev
systemctl --user restart budget-app-dev
systemctl --user stop budget-app-dev
systemctl --user start budget-app-dev
journalctl --user -u budget-app-dev -f
```

Useful checks:

```bash
loginctl show-user sjmclean -p Linger
ss -ltnp | grep -E ':3000|:5173'
```

Current development endpoints are frontend/Vite on port `5173` and the
backend/server on port `3000`.

This is a development-operability baseline, not a production deployment model.
Production serving, reverse proxying, deployment automation, upgrade procedures,
packaging and broader operational hardening remain roadmap work.
