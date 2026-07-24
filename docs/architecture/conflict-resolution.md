# Replication conflict resolution

Milestone 9 adds durable detection and review of concurrent writes to the same canonical persistence key.

## Convergence rule

The server's global operation cursor is the deterministic ordering authority. Remote operations are applied in cursor order, so every device converges on the same value even before a user reviews a conflict.

## Detection

A conflict is recorded when:

- this device had an unsynchronised local operation at the start of a replication run;
- a newly pulled operation from another device targets the same key; and
- the two mutations are not equivalent.

Equivalent writes are not conflicts. A local set and remote set of the same value converge silently.

## Resolution

- **Accept remote** marks the conflict resolved because the deterministic remote winner is already applied.
- **Keep mine** marks the conflict resolved and emits a new local operation that reasserts this device's value. That operation then replicates normally.

Conflict records are diagnostics and review state. They are not included in canonical checkpoints.
