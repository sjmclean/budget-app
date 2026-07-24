# Checkpoints

## Purpose

A checkpoint is a compact, integrity-checked baseline of canonical Budget App data at a known local operation-journal boundary.

Recovery and future device bootstrap use:

```text
checkpoint + operations recorded after checkpoint.throughSequence
```

A checkpoint accelerates recovery; it does not replace operations that have not yet been acknowledged by a sync generation.

## Format

Checkpoint format version 1 contains:

- checkpoint ID and creation time;
- source device ID;
- local journal sequence included by the snapshot;
- local database schema version;
- canonical key/value entries only;
- entry and byte counts;
- deterministic FNV-1a 64-bit integrity hash.

Keys that are browser preferences, diagnostics, launcher state, or other device-local data are excluded.

## Atomicity

Checkpoint creation is ordered through the same serialized write coordinator as database mutations. The in-memory state and journal cursor are captured synchronously, then the checkpoint is persisted after every earlier mutation and before every later queued mutation.

Restore is a single IndexedDB transaction across records, journal, checkpoint, and metadata stores. It:

1. verifies checkpoint format, schema compatibility, and integrity;
2. applies later operations idempotently by operation ID;
3. replaces canonical records while retaining device-local records;
4. clears the local unsynchronised journal;
5. resets the local sequence to zero;
6. persists a fresh checkpoint for the restored state.

Imported operations are not copied into the local journal. They are already historical input, not new local changes.

## Retention and pruning

The browser retains the five newest checkpoints. Older checkpoints are deleted in the same transaction that persists a new checkpoint.

Operation journal entries are deliberately **not** pruned in this milestone. Safe journal pruning requires a server generation and acknowledgement boundary proving that every required device can recover from a retained checkpoint. That policy belongs with synchronisation transport.

## Compatibility policy

- Unknown checkpoint format versions are rejected.
- Checkpoints from a newer database schema are rejected.
- Older compatible schema checkpoints are accepted.
- Integrity mismatches are rejected before any database mutation.
- A failed restore transaction leaves the previous database unchanged.
