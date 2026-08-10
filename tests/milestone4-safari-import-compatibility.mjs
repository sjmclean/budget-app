import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
  "utf8",
);
const dialog = readFileSync(
  "apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx",
  "utf8",
);

assert.match(
  worker,
  /installOpfsSAHPoolVfs\(\{/,
  "Safari-compatible imports must install SQLite's durable OPFS SAH-pool fallback.",
);
assert.match(
  worker,
  /persistentBackend === "opfs-sahpool"/,
  "The worker must explicitly route durable database operations through the fallback.",
);
assert.doesNotMatch(
  worker,
  /Staged import requires OPFS SQLite\./,
  "Staged import must not reject a browser merely because the SharedArrayBuffer OPFS VFS is absent.",
);
assert.match(
  dialog,
  /promptForYnab4CreditCardBehaviour\(entries\)/,
  "File selection must present the YNAB4 credit-card decision immediately.",
);
assert.match(
  dialog,
  /continueImport: async \(behaviour\) => \{\s*await prepareYnab4PackageEntriesForStreaming\(entries\);\s*await handleYnab4PackageEntries\(entries, behaviour\);/s,
  "Streaming preparation and discovery must start only after the user chooses credit-card behaviour.",
);

console.log("Milestone 4 Safari import compatibility and early import options passed.");
