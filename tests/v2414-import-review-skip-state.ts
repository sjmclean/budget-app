import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert.match(
  dialogSource,
  /reviewDecision === "skipped"/,
  "import review candidates should track skipped review decisions",
);

assert.match(
  dialogSource,
  /function restoreCandidate\(candidateId: string\)/,
  "skipped import candidates should be restorable",
);

assert.match(
  dialogSource,
  /getCandidateStatusLabel[\s\S]*return "Skipped"/,
  "skipped import candidates should display a Skipped status label",
);

assert.match(
  dialogSource,
  /transaction-import-review-card-skipped/,
  "skipped import candidates should receive a dedicated skipped row class",
);

assert.match(
  dialogSource,
  /isSkipped[\s\S]*restoreCandidate\(candidate\.id\)[\s\S]*Restore/,
  "skipped import review rows should show a Restore action",
);

assert.match(
  dialogSource,
  /skippedCount/,
  "import review summary should track skipped candidates",
);

assert.match(
  registerCss,
  /\.transaction-import-review-card-skipped/,
  "skipped import review rows should have dimmed styling",
);

assert.match(
  packageJson,
  /"test:v2414:import-review-skip-state": "tsx tests\/v2414-import-review-skip-state\.ts"/,
  "package.json should expose the v2.41.4 import review skip state test",
);

console.log("v2.41.4 import review skip state checks passed");
