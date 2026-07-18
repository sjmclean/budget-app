import fs from "node:fs";

const dialog = fs.readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);
const knowledge = fs.readFileSync(
  new URL("../apps/web/src/features/accounts/transactionImportKnowledge.ts", import.meta.url),
  "utf8",
);

for (const marker of [
  "sourceFileHash: string | null = fileHash",
  "findImportedFileFingerprint(accountId, sourceFileHash)",
  "nextFileHash",
]) {
  if (!dialog.includes(marker)) {
    throw new Error(`Missing explicit duplicate-file hash marker: ${marker}`);
  }
}

if (!knowledge.includes("occurrenceCount: Math.max(")) {
  throw new Error("Imported occurrence counts are still cumulative rather than representative");
}

console.log("v3.20.0 source hash and occurrence ledger checks passed");
