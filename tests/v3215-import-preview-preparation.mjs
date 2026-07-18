import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);
const preparation = readFileSync(
  new URL("../apps/web/src/features/accounts/transactionImportPreviewPreparation.ts", import.meta.url),
  "utf8",
);

assert.match(dialog, /prepareTransactionImportPreview\(\{/);
assert.doesNotMatch(dialog, /const registerCounts = new Map<string, number>/);
assert.doesNotMatch(dialog, /function normaliseSuggestedImportCategory/);
assert.match(preparation, /export function recoverExactDuplicateFileCandidates/);
assert.match(preparation, /export function prepareTransactionImportPreview/);
assert.match(preparation, /registerCounts\.set\(key, available - 1\)/);
assert.match(preparation, /candidate\.status === "invalid"/);

console.log("v3.21.5 import preview preparation structure checks passed");
