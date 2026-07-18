import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const port = read("apps/web/src/features/accounts/accountRegisterPersistencePort.ts");
const service = read("apps/web/src/features/accounts/accountRegisterService.ts");
const engine = read("apps/web/src/features/accounts/importCommitEngine.ts");
const dialog = read("apps/web/src/features/accounts/components/TransactionImportDialog.tsx");
const page = read("apps/web/src/pages/AccountRegisterPage.tsx");

assert.match(port, /commitTransactionBatch\?/);
assert.match(port, /RegisterTransactionBatchChangeSet/);
assert.match(service, /storageSnapshot/);
assert.match(service, /RegisterTransactionBatchCommitError/);
assert.match(service, /rollbackSucceeded/);
assert.match(engine, /Commit register batch/);
assert.match(engine, /registerRollbackAttempted/);
assert.match(engine, /registerRollbackSucceeded/);
assert.match(dialog, /onCommitRegisterChanges/);
assert.match(page, /commitTransactionBatch\(\{ additions, updates \}\)/);

console.log("v3.21.9 import register batch rollback structure passed");
