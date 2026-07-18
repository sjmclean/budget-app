import assert from "node:assert/strict";
import fs from "node:fs";

const engine = fs.readFileSync(
  "apps/web/src/features/accounts/importCommitEngine.ts",
  "utf8",
);
const dialog = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(engine, /export interface ImportCommitPlan/);
assert.match(engine, /export function prepareImportCommit/);
assert.match(engine, /Validate commit plan/);
assert.match(engine, /Stage merchant knowledge/);
assert.match(engine, /export class ImportCommitValidationError/);
assert.match(engine, /export class ImportCommitExecutionError/);
assert.match(engine, /status: "completed"/);
assert.match(engine, /status: "failed"/);
assert.match(engine, /failedStage: string \| null/);
assert.match(engine, /registerMutationStarted: boolean/);
assert.match(engine, /knowledgePersisted: boolean/);
assert.match(engine, /identityCount: 0/);
assert.match(engine, /rememberAudit\(audit\)/);

const persistIndex = engine.indexOf('failedStage = "Remember import knowledge"');
const addIndex = engine.indexOf('failedStage = "Commit transactions"');
const updateIndex = engine.indexOf('failedStage = "Update matched transactions"');
assert.ok(persistIndex > addIndex);
assert.ok(persistIndex > updateIndex);

assert.match(dialog, /ImportCommitExecutionError/);
assert.match(dialog, /No import identity or merchant knowledge was recorded/);
assert.match(dialog, /No register or import-identity changes were made/);

console.log("v3.21.3 import commit integrity checks passed");
