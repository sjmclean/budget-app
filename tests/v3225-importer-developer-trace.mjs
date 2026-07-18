import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const transactionImport = readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const preview = readFileSync(
  "apps/web/src/features/accounts/transactionImportPreviewPreparation.ts",
  "utf8",
);

assert.match(dialog, /developerPerformanceMode/);
assert.match(dialog, /Importer trace diagnostics/);
assert.match(dialog, /Copy trace JSON/);
assert.match(dialog, /serialiseTransactionImportTrace/);
assert.match(transactionImport, /stage: "merchant-resolution"/);
assert.match(transactionImport, /stage: "reconciliation"/);
assert.match(preview, /stage: "duplicate-recovery"/);
assert.doesNotMatch(dialog, /Import performance diagnostics[\s\S]*confidence rating/i);

console.log("v3.22.5 importer developer trace structure tests passed");
