# Shared-server runtime removal

Budget App now has one production multi-device architecture: the local database is authoritative and the replication service exchanges journal operations, checkpoints, conflicts, and attachment blobs with the server.

This cleanup removes the former server-authoritative key/value runtime, its browser migration screen, whole-snapshot HTTP routes, revision SSE stream, and provider `watch()` contract. Browser local storage remains temporarily as a rollback and one-time migration source.

The existing SQLite file is deliberately retained and its default filename is unchanged so deployments do not accidentally start with an empty replication database. Old `shared_storage` tables may remain physically present in existing databases, but no runtime code reads or writes them. They can be dropped later through an explicit, separately backed-up database maintenance migration.

Normal remote updates continue through the replication engine and persistence change bus. The explicit full reload after a user-requested server rebuild remains intentional.
