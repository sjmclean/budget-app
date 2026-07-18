import fs from "node:fs";
import assert from "node:assert/strict";

const dialog = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const register = fs.readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);

assert.match(dialog, /initialFile\?: File \| null/);
assert.match(dialog, /useState\(Boolean\(initialFile\)\)/);
assert.match(dialog, /Building payee and category suggestions/);
assert.match(dialog, /draftValue: ""/);
assert.match(dialog, /suggestMerchantKnowledge\(merchantKnowledgeRef\.current, value\)/);
assert.match(dialog, /onClick=\{\(\) => skipCandidate\(candidate\.id\)\}/);
assert.match(register, /transactionImportFileInputRef\.current\?\.click\(\)/);
assert.match(register, /initialFile=\{pendingImportFile\}/);

console.log("v3.19.3 importer UX response and suggestion checks passed");
