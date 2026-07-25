# Replication v492 audit and remediation

## Evidence examined

- Browser/server failure logs from the YNAB4 re-import.
- Client journal diagnostics: local sequence 456, pushed sequence 16.
- Replication engine, transport, IndexedDB journal, server request parser and SQLite store.
- The included server SQLite database.
- YNAB4 import writer and version-history snapshot lifecycle.

## Confirmed root cause

The client reads up to 500 pending journal operations and sends the entire result in one JSON request. The only batching boundary is operation count. The server rejects request bodies larger than 50 MiB.

The included database contains 50 server operations totalling 25,486,602 JSON bytes. Individual operations are already large:

- A version-history snapshot operation is 16,555,456 bytes.
- The account-register operation is 8,108,781 bytes.
- The payee operation is 592,768 bytes.

The local device had 440 unpushed operations after the import. A single count-based batch of those operations necessarily exceeded the server's 50 MiB request limit. The browser then reported connection resets while the replication service retried the same batch.

## Additional correctness finding

The server used `INSERT OR IGNORE`, while the client advanced its local push cursor after any successful HTTP response without proving every submitted operation was acknowledged. A uniqueness collision could therefore be silently ignored and the client could advance past an operation that was not stored.

## Additional memory finding

Before pushing, the engine loaded every pending journal operation into memory for conflict detection. Whole-document entries make this unnecessarily expensive. Only the latest pending mutation for each key represents the current local intent for conflict comparison.

## Implemented remediation

1. Push batches are selected by exact UTF-8 JSON request size as well as operation count.
2. The normal target is 8 MiB, leaving substantial headroom below the 50 MiB server limit.
3. A legitimate operation larger than 8 MiB is sent alone if its complete request is at most 48 MiB.
4. A single operation above 48 MiB fails locally with a clear error instead of causing a reset/retry loop.
5. The transport and batch estimator share the same serializer, preventing size-estimation drift.
6. The push cursor advances only after all submitted operations are acknowledged.
7. The server now distinguishes exact idempotent retries from identity/sequence collisions and returns `acknowledgedCount`.
8. Conflict context retains only the latest pending mutation per storage key.
9. Trace events now include exact payload bytes and whether a singleton exceeded the normal target.

## Compatibility

The response change is additive. Existing clients ignore `acknowledgedCount`. The updated client accepts an older server only when `acceptedCount` equals the submitted operation count; otherwise it stops safely without advancing the cursor.

## Expected recovery

The existing local journal remains intact. After deploying this overlay, the device should resume at sequence 17 and upload the remaining entries through a series of bounded requests. Re-importing is not required.
