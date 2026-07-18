import assert from "node:assert/strict";
import fs from "node:fs";

const reconciliation = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImportReconciliation.ts",
  "utf8",
);
const dialog = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(reconciliation, /TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS = 7/);
assert.match(reconciliation, /Number\(right\.merchantMatches\) - Number\(left\.merchantMatches\)/);
assert.match(reconciliation, /left\.daysApart - right\.daysApart/);
assert.doesNotMatch(reconciliation, /calculateImportMatchConfidence/);
assert.doesNotMatch(reconciliation, /isSuggestedMatch/);
assert.match(dialog, /transaction-import-register-match-select/);
assert.match(dialog, /selectMatchedRegisterTransaction/);
assert.match(dialog, /matchedIdsUsedByOtherRows/);
assert.doesNotMatch(dialog, /★★★★★|confidence label/i);

console.log("v3.23.1 Actual-style reconciliation structure tests passed");
