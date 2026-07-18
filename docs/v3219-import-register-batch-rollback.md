# v3.21.9 Import Register Batch Rollback

The importer now submits additions and matched-transaction updates through one
logical register batch boundary when the active persistence adapter supports it.

The browser/local-storage register service snapshots the complete stored register
package before mutation. If any addition or matched update fails, it restores that
snapshot before rejecting. The importer audit records whether a batch boundary was
used and whether rollback was attempted and succeeded.

A successful batch returns a change set containing added transaction IDs and the
before/after versions of updated transactions. This is intentionally shaped for a
future general command-history Undo feature, but no user-facing Undo action is
introduced in this milestone.

The SQLite adapter does not yet expose a compatible transaction runner through the
web persistence port. Callers retain the existing sequential compatibility path for
adapters without `commitTransactionBatch`; true SQLite transactionality remains a
separate persistence-layer milestone.
