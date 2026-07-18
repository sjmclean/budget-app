import assert from "node:assert/strict";
import fs from "node:fs";

const dialog = fs.readFileSync("apps/web/src/features/accounts/components/TransactionImportDialog.tsx", "utf8");
const service = fs.readFileSync("apps/web/src/features/accounts/transactionImportSession.ts", "utf8");
assert.match(service, /createBudgetScopedStorage/);
assert.match(service, /readTransactionImportSession/);
assert.match(service, /writeTransactionImportSession/);
assert.match(service, /deleteTransactionImportSession/);
assert.match(dialog, /Restored your saved review/);
assert.match(dialog, /step !== "review"/);
assert.match(dialog, /deleteTransactionImportSession\(selectedAccountId\)/);
console.log("v3.22.3 persistent import session structure tests passed");
