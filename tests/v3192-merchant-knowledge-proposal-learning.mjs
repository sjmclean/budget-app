import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);
const knowledge = readFileSync(
  new URL("../apps/web/src/features/accounts/merchantKnowledge.ts", import.meta.url),
  "utf8",
);

assert.match(
  dialog,
  /await merchantKnowledgeBootstrapRef\.current/,
  "file analysis should wait for the existing register bootstrap before proposals are created",
);
assert.match(
  dialog,
  /if \(candidate\.status !== "new"\) return candidate/,
  "Merchant Knowledge proposals should apply only to new transactions",
);
assert.match(
  dialog,
  /suggestion\.transferAccountName\s*\? `Transfer: \$\{suggestion\.transferAccountName\}`/,
  "transfer suggestions should flow through the register Payee convention",
);
assert.match(
  dialog,
  /for \(const candidate of matchedCandidates\)[\s\S]*matchedTransactionOrigins\[candidate\.id\][\s\S]*recordMerchantCategoryEvidence/,
  "Update & Match corrections should teach Merchant Knowledge",
);
assert.match(
  dialog,
  /for \(const candidate of importedCandidates\)[\s\S]*recordMerchantTransferEvidence/,
  "accepted transfer corrections should teach transfer evidence",
);
assert.match(
  knowledge,
  /aliases: merchant\.aliases\.map\(\(alias\) => \(\{[\s\S]*occurrenceCount: 0/,
  "bootstrap should rebuild alias occurrence evidence without inflating it on every importer open",
);

console.log("v3.19.2 Merchant Knowledge proposal and learning checks passed");
