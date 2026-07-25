# Replication Phase 1: Pipeline tracing

This phase adds observation only. It does not change replication acknowledgement,
cursor advancement, conflict handling, or server insertion behaviour.

Each replication run now records privacy-safe metadata for these boundaries:

1. replication run and starting cursors;
2. local journal operations selected for participation;
3. each push batch and the server's submitted/accepted counts;
4. persisted pushed-local cursor;
5. each pull batch;
6. requested and applied remote-operation counts;
7. persisted pulled-remote cursor;
8. final run totals.

Operation trace entries include operation ID, device ID, sequence, mutation type,
and storage key. Mutation values are intentionally excluded.

The in-memory trace is bounded to 500 events and can be read through
`getReplicationTraceEvents()` or serialised through
`serialiseReplicationTraceEvents()` from `replicationTrace.ts`.

The next phase should use these observations to prove where the imported
budget's scoped `budget-app.accounts.v1` operation is lost before changing
acknowledgement semantics.
