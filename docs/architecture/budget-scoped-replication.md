# Budget-scoped replication

Replication protocol version 2 requires a `budgetId` on every generation,
operation, checkpoint, and blob request. The server authorizes that budget
before reading or mutating replication state.

Server generations, operation identities, checkpoints, and blob metadata are
partitioned by budget. A payload is rejected unless every mutation and
checkpoint key begins with that budget's canonical storage namespace.

Browser replication retains an independent generation and cursor tuple for
each budget. Journal scanning skips other budgets without marking their
per-budget cursors as synchronized. Checkpoints contain only the selected
budget's entries.

Checkpoint recovery is budget-scoped. The browser rejects a checkpoint or
replay operation containing a key outside the requested budget, replaces only
that budget's canonical records, and preserves other budgets, global records,
journal entries, and conflicts. Generation changes and manual recovery use
this same path.

Journal compaction is selective even though sequence numbers are global. Once
the server acknowledges a checkpoint boundary, the browser removes only
operations at or below that boundary whose keys belong to the checkpoint's
budget. Interleaved operations for other budgets and newer operations remain
available for their own replication streams.

The version 3 hosted schema migration archives the former global replication
tables under `legacy_global_*` names and starts clean per-budget generations.
The old stream is not copied because it may contain records from multiple
budgets and cannot be partitioned reliably after the fact.

Attachment transfer derives content hashes exclusively from canonical entries
inside the selected budget namespace. Upload ignores every locally cached blob
that is not referenced by that set. Download likewise requests only hashes
referenced by the selected budget and verifies SHA-256 before persistence.

Browser attachment databases are also user-scoped. The first administrator
retains the original database for upgrade compatibility; additional users and
the signed-out state receive separate databases.
