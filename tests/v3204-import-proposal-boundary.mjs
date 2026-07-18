import fs from "node:fs";

const transactionImport = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const commit = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImportCommit.ts",
  "utf8",
);
const dialog = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  transactionImport.includes("export interface TransactionImportProposal"),
  "Editable proposal model is missing.",
);
assert(
  transactionImport.includes("proposal: TransactionImportProposal"),
  "Lifecycle does not own the proposal.",
);
assert(
  commit.includes("const proposal = candidate.lifecycle.proposal"),
  "Commit still reads editable values from the parsed Bank transaction.",
);
assert(
  dialog.includes("lifecycle: {\n                ...candidate.lifecycle,\n                proposal:"),
  "Inline editing does not update the proposal boundary.",
);
assert(
  !dialog.includes("parsed: { ...candidate.parsed, ...updates }"),
  "Inline editing still mutates parsed Bank data.",
);
assert(
  dialog.includes("getCandidateProposalTransaction(candidate)"),
  "Review validation does not consume the proposal view.",
);

console.log("v3.20.4 import proposal boundary checks passed");
