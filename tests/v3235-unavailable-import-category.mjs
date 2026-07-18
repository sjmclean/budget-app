import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImportCommit.ts",
  "utf8",
);
const dialog = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(source, /resolvedCategory\?\.name \?\? "Uncategorised"/);
assert.match(dialog, /developerPerformanceMode && audit\?\.errorMessage/);
assert.ok(fs.existsSync("tests/v3235-unavailable-import-category.ts"));
console.log("v3.23.5 unavailable import category structure tests passed");
