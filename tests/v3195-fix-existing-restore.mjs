import fs from "node:fs";

const source = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

const checks = [
  ["existing restore closes history", source.includes("setHistoryOpen(false);\n    setRestoredCandidateId(candidateId);")],
  ["restored candidate is addressable", source.includes("data-import-candidate-id={candidate.id}")],
  ["restored candidate is focused", source.includes("restoredCard?.focus({ preventScroll: true });")],
  ["restored candidate is scrolled into view", source.includes("restoredCard?.scrollIntoView({ behavior: \"smooth\", block: \"center\" });")],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Failed: ${label}`);
}

console.log("Existing importer restore checks passed");
