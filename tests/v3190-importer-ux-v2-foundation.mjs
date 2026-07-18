import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importEngine = readFileSync(
  new URL("../apps/web/src/features/accounts/transactionImport.ts", import.meta.url),
  "utf8",
);
const dialog = readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);

assert.doesNotMatch(importEngine, /"possible-match"/);
assert.match(importEngine, /TransactionImportMatchStatus =\s*\n\s*"exact-match" \| "new" \| "invalid"/);
assert.doesNotMatch(dialog, /candidate\.status === "possible-match"/);
assert.match(dialog, />\s*Bank\s*</);
assert.match(dialog, />\s*In Register\s*</);
assert.match(dialog, />\s*New Transaction\s*</);
assert.match(dialog, /Update & Match/);
assert.match(dialog, /Cancel Changes/);
assert.match(dialog, /Double-click to update the register payee/);
assert.match(dialog, /Double-click to update the register category/);
assert.match(dialog, /value\.match\(\/\^Transfer:/);

console.log("Importer UX v2 foundation checks passed");
