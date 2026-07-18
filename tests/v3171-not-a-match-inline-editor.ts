import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const commit = readFileSync(
  "apps/web/src/features/accounts/transactionImportCommit.ts",
  "utf8",
);

assert.match(dialog, /Review the new transaction details before importing it/);
assert.match(dialog, /transaction-import-new-editor/);
assert.match(dialog, /Back to Match/);
assert.match(dialog, /updateCandidateDetails/);
assert.match(dialog, /importedCategoryName/);
assert.match(dialog, /transferAccountName/);
assert.match(commit, /parsed\.importedCategoryName\?\.trim\(\)/);

console.log("v3.17.1 not-a-match inline editor checks passed");
