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

assert.ok(dialog.includes("Use Existing"));
assert.ok(dialog.includes(">\n                        Match\n"));
assert.ok(dialog.includes("Not a Match"));
assert.ok(dialog.includes("Don't import transaction memos"));
assert.ok(dialog.includes("transaction-import-inline-alias"));
assert.ok(!dialog.includes("<strong>Alias suggestions</strong>"));
assert.ok(dialog.includes("current.filter((entry) => entry.id !== candidateId)"));
assert.ok(dialog.includes("All transactions processed"));
assert.ok(commit.includes("includeMemos?: boolean"));
assert.ok(commit.includes("options.includeMemos === false ? undefined : parsed.memo"));

console.log("v3.16.4 import processing queue checks passed");
