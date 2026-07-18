import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reconciliation = readFileSync(
  "apps/web/src/features/accounts/transactionImportReconciliation.ts",
  "utf8",
);
const importer = readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);

assert.match(reconciliation, /export function reconcileTransactionImportCandidate/);
assert.match(reconciliation, /excludedTransactionIds/);
assert.match(reconciliation, /selectedCandidate/);
assert.match(reconciliation, /TransactionImportMatchEvidence/);
assert.match(importer, /reconcileTransactionImportCandidate\(\{/);
assert.doesNotMatch(importer, /function analyseImportMatchCandidate/);
assert.doesNotMatch(importer, /function calculateImportMatchConfidence/);
assert.doesNotMatch(importer, /function calculatePayeeSimilarity/);

console.log("v3.22.0 transaction import reconciliation structure tests passed");
