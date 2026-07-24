# Milestone 8: Stabilisation and recovery

This milestone adds acknowledged journal pruning, inspectable replication diagnostics, and explicit recovery from the latest remote checkpoint.

## Safety invariants

- Journal entries are pruned only after the server acknowledges a checkpoint that covers them.
- The prune boundary is the minimum of the server acknowledgement, checkpoint boundary, and locally pushed sequence.
- Recovery requires a valid remote checkpoint and resets replication cursors before replaying later remote operations.
- Diagnostics are exportable without including attachment binary content.

## Operational controls

Settings now exposes Sync now, Create checkpoint, Export diagnostics, and Rebuild from server.
