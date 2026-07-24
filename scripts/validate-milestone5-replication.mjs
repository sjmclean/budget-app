import { readFile } from "node:fs/promises";

const required = {
  "apps/web/src/features/persistence/replication.ts": [
    "ReplicationLocalStorePort",
    "RemoteOperationEnvelope",
    "REPLICATION_PROTOCOL_VERSION",
  ],
  "apps/web/src/features/persistence/replicationEngine.ts": [
    "replicatePersistenceProvider",
    "pushOperations",
    "pullOperations",
  ],
  "apps/web/src/features/persistence/replicationTransport.ts": [
    "createHttpReplicationTransport",
    "/api/replication/operations/push",
    "/api/replication/checkpoints/latest",
  ],
  "apps/server/src/replicationStore.mjs": [
    "replication_generations",
    "replication_operations",
    "replication_checkpoints",
    "UNIQUE(generation_id, operation_id)",
  ],
  "apps/server/src/server.mjs": [
    "/api/replication/generation",
    "/api/replication/operations/pull",
    "/api/replication/checkpoints",
  ],
};

for (const [file, fragments] of Object.entries(required)) {
  const content = await readFile(file, "utf8");
  for (const fragment of fragments) {
    if (!content.includes(fragment)) {
      throw new Error(`${file} is missing required Milestone 5 fragment: ${fragment}`);
    }
  }
}

console.log("Milestone 5 replication validation passed.");
