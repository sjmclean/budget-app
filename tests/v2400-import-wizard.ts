import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(dialog, /type TransactionImportStep = "upload" \| "mapping" \| "review" \| "complete"/);
assert.match(dialog, /detectImportFileType/);
assert.match(dialog, /transaction-import-dropzone/);
assert.match(dialog, /CSV detected\. Map the missing columns/);
assert.match(dialog, /Set up this CSV format/);
assert.match(dialog, /Review transactions/);
assert.match(dialog, /Import complete/);
assert.match(dialog, /Supports CSV, QIF, OFX\/QFX, and JSON files/);
assert.match(dialog, /await onImportTransactions\(importable\)/);
assert.doesNotMatch(dialog, /Choose CSV File/);

assert.match(styles, /\.transaction-import-steps/);
assert.match(styles, /\.transaction-import-dropzone/);
assert.match(styles, /\.transaction-import-detection-panel/);
assert.match(styles, /\.transaction-import-complete-step/);

assert.equal(
  packageJson.scripts["test:v2400"],
  "pnpm test:v2400:import-wizard",
);

console.log("v2.40.0 import wizard checks passed");
