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

function assertIncludes(source, values, description) {
  for (const value of values) {
    assert.ok(
      source.includes(value),
      `${description}: expected ${JSON.stringify(value)}`,
    );
  }
}

// AccountRegisterPage owns only the launch lifecycle. File selection and
// parsing belong to TransactionImportDialog.
assertIncludes(
  register,
  [
    "Import Transactions",
    "setIsTransactionImportOpen(true)",
    "<TransactionImportDialog",
  ],
  "register importer launch contract",
);

assertIncludes(
  dialog,
  [
    "Import Transactions",
    'type="file"',
    'accept=".csv,.qif,.ofx,.qfx,text/csv"',
    "transaction-import-dropzone",
    "fileInputRef.current?.click()",
    "event.dataTransfer.files?.[0]",
    "void readFile(file)",
  ],
  "importer-owned upload and dropzone contract",
);

assertIncludes(
  dialog,
  [
    "isAnalysing",
    'role="status"',
    'aria-live="polite"',
    "Analysing transactions",
    "Building payee and category suggestions",
  ],
  "analysis and progress contract",
);

assertIncludes(
  dialog,
  [
    "buildTransactionImportMerchantProposal",
    "candidateAliasSuggestion",
    "acceptAliasSuggestion",
    "Edit Payee",
    "Edit Category",
    "skipCandidate(candidate.id)",
    "Review possible matches",
    "Choose this transaction",
  ],
  "merchant suggestions and review actions contract",
);

// Guard against accidentally restoring the obsolete duplicate file-input
// architecture in AccountRegisterPage.
for (const obsolete of [
  "initialFile?: File | null",
  "useState(Boolean(initialFile))",
  "transactionImportFileInputRef",
  "initialFile={pendingImportFile}",
  "pendingImportFile",
]) {
  assert.equal(
    dialog.includes(obsolete) || register.includes(obsolete),
    false,
    `obsolete importer launch architecture must remain removed: ${obsolete}`,
  );
}

console.log("v3.19.3 current importer UX ownership and review checks passed");
