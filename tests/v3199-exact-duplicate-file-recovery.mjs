import fs from "node:fs";

const dialogSource = fs.readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);
const preparationSource = fs.readFileSync(
  new URL("../apps/web/src/features/accounts/transactionImportPreviewPreparation.ts", import.meta.url),
  "utf8",
);

for (const expected of [
  "prepareTransactionImportPreview",
  "findImportedFileFingerprint",
  "already in your budget",
]) {
  if (!dialogSource.includes(expected)) {
    throw new Error(`Missing exact duplicate file dialog marker: ${expected}`);
  }
}

for (const expected of [
  "recoverExactDuplicateFileCandidates",
  "representedCandidates",
  "registerCounts",
  "reviewCandidates",
  "registerCounts.set(key, available - 1)",
]) {
  if (!preparationSource.includes(expected)) {
    throw new Error(`Missing exact duplicate recovery service marker: ${expected}`);
  }
}

console.log("v3.19.9 exact duplicate file recovery checks passed");
