import { readFile } from "node:fs/promises";

const required = new Map([
  ["apps/web/src/features/persistence/checkpoint.ts", [
    "CHECKPOINT_FORMAT_VERSION",
    "calculateCheckpointIntegrityHash",
    "assertCompatibleCheckpoint",
    "applyOperationsToCheckpointEntries",
    "CheckpointPort",
    "replicatedThroughCursor",
  ]],
  ["apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts", [
    "const DATABASE_VERSION = 4",
    'const CHECKPOINT_STORE = "checkpoints"',
    "createCheckpoint",
    "getLatestCheckpoint",
    "restoreCheckpoint",
    "restoreDatabaseFromCheckpoint",
    "MAX_RETAINED_CHECKPOINTS = 5",
  ]],
  ["apps/web/src/features/persistence/localDatabasePersistenceProvider.ts", [
    "checkpoints: storage",
  ]],
  ["docs/architecture/checkpoints.md", [
    "checkpoint + operations recorded after checkpoint.throughSequence",
    "Operation journal entries are deliberately **not** pruned",
  ]],
]);

const failures = [];
for (const [path, needles] of required) {
  const source = await readFile(path, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) failures.push(`${path}: missing ${needle}`);
  }
}

const checkpointSource = await readFile("apps/web/src/features/persistence/checkpoint.ts", "utf8");
if (!checkpointSource.includes('integrityAlgorithm: CHECKPOINT_INTEGRITY_ALGORITHM')) {
  failures.push("checkpoint format does not declare its integrity algorithm");
}

if (failures.length) {
  console.error("Milestone 4 checkpoint validation failed:\n" + failures.map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}
console.log("Milestone 4 checkpoint validation passed.");
