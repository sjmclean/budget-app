import fs from "node:fs";

const transactionImport = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const preparation = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImportPreviewPreparation.ts",
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  transactionImport.includes("export interface TransactionImportLifecycle"),
  "Import candidate lifecycle model is missing.",
);
assert(
  transactionImport.includes("source: TransactionImportSourceSnapshot"),
  "Lifecycle does not preserve an immutable source snapshot.",
);
assert(
  transactionImport.includes("merchant: TransactionImportMerchantResolution"),
  "Lifecycle does not carry the single merchant resolution.",
);
assert(
  transactionImport.includes("lifecycle: TransactionImportLifecycle"),
  "Candidates do not carry lifecycle state.",
);
assert(
  preparation.includes("const suggestion = candidate.lifecycle.merchant;"),
  "Proposal generation recalculates Merchant Knowledge instead of using lifecycle resolution.",
);
assert(
  transactionImport.includes("proposal: TransactionImportProposal"),
  "Lifecycle does not separate editable proposal values from the parsed source.",
);

console.log("v3.20.2 import candidate lifecycle checks passed");
