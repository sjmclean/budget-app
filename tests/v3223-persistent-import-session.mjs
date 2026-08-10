import assert from "node:assert/strict";
import fs from "node:fs";

const dialog = fs.readFileSync("apps/web/src/features/accounts/components/TransactionImportDialog.tsx", "utf8");
const service = fs.readFileSync("apps/web/src/features/accounts/transactionImportSession.ts", "utf8");
const entity = fs.readFileSync("apps/web/src/features/accounts/entities/importSessionEntity.ts", "utf8");
assert.match(service, /createBudgetScopedStorage/);
assert.match(service, /readTransactionImportSessionEntity/);
assert.match(service, /writeTransactionImportSessionEntity/);
assert.match(service, /tombstoneTransactionImportSessionEntity/);
assert.doesNotMatch(service, /transaction-import-session\.v1/);
assert.match(entity, /createEntityRepository/);
assert.match(entity, /transaction-import-session-index/);
assert.match(entity, /tombstone/);
assert.match(dialog, /Restored your saved review/);
assert.match(dialog, /step !== "review"/);
assert.match(dialog, /deleteTransactionImportSession\(selectedAccountId\)/);
console.log("v3.22.3 persistent import session entity structure tests passed");
