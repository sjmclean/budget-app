import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const builder = readFileSync(
  "apps/web/src/features/accounts/transactionImportMerchantProposal.ts",
  "utf8",
);
const preview = readFileSync(
  "apps/web/src/features/accounts/transactionImportPreviewPreparation.ts",
  "utf8",
);

assert.match(builder, /export function buildTransactionImportMerchantProposal/);
assert.match(builder, /export function resolveTransactionImportMerchant/);
assert.match(builder, /export function normaliseSuggestedImportCategory/);
assert.match(dialog, /buildTransactionImportMerchantProposal\(/);
assert.match(dialog, /resolveTransactionImportMerchant\(/);
assert.doesNotMatch(dialog, /suggestMerchantKnowledge\(/);
assert.doesNotMatch(dialog, /function normaliseSuggestedImportCategory/);
assert.match(preview, /applyTransactionImportMerchantProposal/);

console.log("v3.21.6 merchant proposal builder structure checks passed");
