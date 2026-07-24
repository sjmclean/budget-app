# Attachment blob replication

## Status

Implemented as the next phase after the background synchronisation service.

## Invariant

Attachment binary content never enters the key/value operation journal or a persistence checkpoint. Operations and checkpoints carry only attachment metadata, including the immutable SHA-256 content address.

```text
transaction metadata + sha256 hash
              │
              ├── operation/checkpoint replication
              │
              └── independent blob replication
```

A local attachment is uploaded before the operation that can make its metadata visible to another device. A receiving device applies metadata first and then resolves any missing hashes from the blob channel. Repeated transfer is safe because blobs are immutable and addressed by their verified content hash.

## Client storage

The browser attachment IndexedDB now has a content-hash index. Content can be read by its device-local `contentRef` or by SHA-256 hash, allowing metadata created on another device to resolve to a locally downloaded copy without rewriting the transaction record.

The replication engine:

1. enumerates locally stored blobs;
2. asks the server whether each hash already exists;
3. uploads only missing blobs;
4. pushes and pulls operation batches;
5. scans the resulting canonical snapshot for attachment references;
6. downloads missing referenced blobs;
7. verifies SHA-256 before accepting downloaded content.

## Server storage

The server stores blob metadata in SQLite and bytes under:

```text
<BUDGET_APP_DATA_DIR>/replication-blobs/<sha256 hex>
```

The directory can be overridden with `BUDGET_APP_REPLICATION_BLOB_DIR`.

Blob writes use a temporary file followed by an atomic rename. The server recomputes SHA-256 and rejects content that does not match the requested address. The API is generation-aware and content-addressed:

```text
HEAD /api/replication/blobs/:hash?generationId=...
PUT  /api/replication/blobs/:hash?generationId=...
GET  /api/replication/blobs/:hash?generationId=...
```

## Deferred work

- remote garbage collection after attachment deletion;
- reference counting or retained-checkpoint reachability analysis;
- resumable/chunked transfer for very large files;
- encryption of remote blobs;
- explicit per-budget authorization.

Garbage collection is deliberately deferred because a blob must not be removed while any retained checkpoint or device may still reference it.
