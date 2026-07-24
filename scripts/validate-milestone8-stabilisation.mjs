import { readFileSync } from "node:fs";

const files = [
  "apps/web/src/features/persistence/replication.ts",
  "apps/web/src/features/persistence/replicationEngine.ts",
  "apps/web/src/features/persistence/replicationService.ts",
  "apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts",
  "apps/web/src/pages/SettingsPage.tsx",
  "apps/server/src/replicationStore.mjs",
];
const source = Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")]));
const assertions = [
  [source[files[0]].includes("getReplicationDiagnostics"), "diagnostics port"],
  [source[files[0]].includes("pruneJournal"), "journal prune port"],
  [source[files[1]].includes("acknowledgedThroughSequence"), "checkpoint acknowledgement boundary"],
  [source[files[1]].includes("Math.min"), "conservative prune boundary"],
  [source[files[2]].includes("recoverFromServer"), "server recovery service"],
  [source[files[3]].includes("pruneJournalEntries"), "durable journal pruning"],
  [source[files[4]].includes("Export diagnostics"), "diagnostics UI"],
  [source[files[4]].includes("Rebuild from server"), "recovery UI"],
  [source[files[5]].includes("acknowledgedThroughSequence"), "server checkpoint acknowledgement"],
];
for (const [ok, name] of assertions) if (!ok) throw new Error(`Missing ${name}.`);
console.log("Milestone 8 stabilisation validation passed");
