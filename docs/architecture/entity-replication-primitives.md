# Entity replication primitives

## Status

Phase 2 foundation. These primitives are available for new entity-level replication code but are intentionally not connected to the legacy storage-key replication pipeline.

## Objective

The long-term replication protocol exchanges domain entities rather than storage documents. Entity fields merge independently with deterministic last-writer-wins rules, while deletion is represented by a durable tombstone.

This phase introduces the reusable mechanics required by later account, category, payee, scheduled-transaction, transaction, and assignment migrations. It does not change the current persistence format or wire protocol.

## Hybrid logical timestamps

`HybridTimestamp` contains:

- `wallTime`: a non-negative millisecond clock value;
- `counter`: a logical counter used when physical time does not advance;
- `nodeId`: a stable device identifier used as the final deterministic ordering component.

Ordering is lexicographic by `wallTime`, `counter`, and `nodeId`.

`tickHybridClock` guarantees that a local timestamp advances even when the system clock stalls or moves backwards. `receiveHybridTimestamp` advances beyond both the local and received clocks, supporting offline and out-of-order delivery.

## LWW registers

`LwwRegister<T>` stores one field value and its timestamp. Registers merge by selecting the greater hybrid timestamp.

A deterministic stable-value tie-breaker is applied only if malformed peers reuse an identical timestamp for different values. Correct writers must generate a new timestamp for every field write.

The register is deliberately generic, but future entities remain responsible for domain rules. For example, transaction transfer relationships and account closure constraints must not be delegated to a generic JSON merge.

## Tombstones

A tombstone is either `null` or a deletion timestamp. Tombstone merge always retains the latest deletion timestamp. Physical deletion must not occur until a later, explicitly designed compaction protocol can prove that every relevant replica has observed the tombstone.

## Replicated entity shape

`ReplicatedEntity<T>` defines:

- stable entity metadata and identity;
- creation timestamp;
- optional tombstone;
- one `LwwRegister` per domain field.

This is a common representation, not a generic entity merger. Each migrated domain will own construction, validation, merge, materialisation, and compatibility rules.

## Migration boundary

During Phase 2:

- legacy storage-key replication remains authoritative for all existing budget data;
- entity primitives have no side effects and write no persistence records;
- no entity messages are sent over the replication transport;
- no dual-write behaviour is introduced.

Phase 3 will add entity persistence. Phase 4 will migrate one domain at a time, beginning with accounts. Document replication will be removed only after all canonical domains have migrated.
