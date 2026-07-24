import fs from "node:fs";

const required = [
  "apps/web/src/features/persistence/conflictResolution.ts",
  "docs/architecture/conflict-resolution.md",
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const storage = fs.readFileSync("apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts", "utf8");
for (const token of ["replication-conflicts", "detectReplicationConflicts", "resolveConflict", "unresolvedConflictCount"]) {
  if (!storage.includes(token)) throw new Error(`Missing conflict foundation token: ${token}`);
}
const engine = fs.readFileSync("apps/web/src/features/persistence/replicationEngine.ts", "utf8");
if (!engine.includes("localOperationsParticipating")) throw new Error("Replication engine does not carry causal local operations.");
console.log("Milestone 9 conflict resolution validation passed");
