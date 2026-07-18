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

assert.match(engine, /export interface ImportCommitSession/);
assert.match(engine, /export async function commitImportSession/);
assert.match(engine, /export interface ImportCommitAuditRecord/);
assert.match(engine, /readRecentImportCommitAudits/);
assert.match(engine, /Build import payload/);
assert.match(engine, /Commit transactions/);
assert.match(engine, /Update matched transactions/);
assert.match(engine, /Remember import knowledge/);
assert.match(engine, /rememberImportedTransactionCandidates/);
assert.match(engine, /rememberImportedFileFingerprint/);
assert.match(engine, /persistMerchantKnowledge/);

assert.match(dialog, /commitImportSession[\s\S]*from "\.\.\/importCommitEngine"/);
assert.match(dialog, /const result = await commitImportSession/);
assert.doesNotMatch(dialog, /buildRegisterTransactionsFromImport\(importedCandidates/);
assert.doesNotMatch(dialog, /rememberImportedTransactionCandidates\(\{/);
const importSelected = dialog.slice(dialog.indexOf("async function importSelected"), dialog.indexOf("\n\n  return (", dialog.indexOf("async function importSelected")));
assert.doesNotMatch(importSelected, /recordMerchantAliasEvidence\(\{/);

console.log("v3.21.1 import commit engine checks passed");
