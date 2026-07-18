import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reconciliation = readFileSync(
  "apps/web/src/features/accounts/transactionImportReconciliation.ts",
  "utf8",
);
const facade = readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const validator = readFileSync(
  "apps/web/src/features/accounts/transactionImportValidator.ts",
  "utf8",
);
const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(reconciliation, /TransactionImportReconciliationKind = "match" \| "new" \| "transfer"/);
assert.match(reconciliation, /transaction\.transferAccountId === destination\.id/);
assert.match(reconciliation, /reconcileTransferImportCandidate/);
assert.match(facade, /parsed\.transferAccountName\?\.trim\(\)/);
assert.match(facade, /transferAccounts: options\?\.transferAccounts/);
assert.match(validator, /candidate\.lifecycle\.proposal\.transferAccountName/);
assert.match(dialog, /Transfer route:/);
assert.doesNotMatch(reconciliation, /payeeSimilarity >= 85[\s\S]*transferAccountName/);

console.log("v3.22.4 transfer reconciliation structure tests passed");
