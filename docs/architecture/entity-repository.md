# Entity repository

## Status

Phase 3 introduces persistence for independently addressable replicated entities. It is intentionally isolated from the legacy storage-key replication path.

## Responsibilities

The generic repository owns:

- deterministic record keys by entity type and entity ID;
- a versioned persistence envelope;
- entity serialisation and deserialisation;
- runtime validation of hybrid timestamps, LWW registers and domain fields;
- lookup, existence checks and deterministic listing;
- tombstone-aware listing;
- explicit corruption errors;
- optional storage flushing.

Domain modules remain responsible for:

- creating entity IDs;
- assigning hybrid timestamps;
- field-level merge rules;
- domain invariants;
- converting legacy documents into entities;
- deciding when physical purge is safe.

## Record shape

Each entity is stored under an independently addressable key:

```text
budget-app.entity-replication.v1/<entity-type>/<encoded-entity-id>
```

The value is a versioned envelope:

```json
{
  "schemaVersion": 1,
  "entityType": "account",
  "payload": "<serialized replicated entity>"
}
```

The payload contains the Phase 2 replicated entity structure: metadata, per-field LWW registers and an optional tombstone.

## Deletion

Normal deletion is represented by an entity tombstone. `repository.list()` excludes tombstoned records by default, while `list({ includeTombstoned: true })` exposes them for replication and recovery.

`repository.purge(id)` is a low-level physical removal operation. Domain code must not use it as an ordinary delete. Physical purge will require a future protocol-level safety rule proving that every relevant replica has observed the tombstone.

## Current boundary

This phase does not:

- migrate Accounts or any other domain;
- dual-write legacy documents and entity records;
- add entity records to the current operation journal;
- change the sync transport protocol;
- make entity storage authoritative.

Unknown persistence keys remain local-only under the Phase 1 classifier, so these new repository keys cannot accidentally enter legacy key replication.
