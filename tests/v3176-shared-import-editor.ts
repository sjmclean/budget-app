import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(dialog, /candidate\.status === "new" \|\|\s*candidate\.status === "invalid"/);
assert.match(dialog, /Edit the payee or classification\. Imported date,/);
assert.match(dialog, /amount and memo remain unchanged/);
assert.match(dialog, /canImportReviewedCandidate/);
assert.match(dialog, /Invalid source dates or amounts must be corrected in the file settings or skipped/);
assert.doesNotMatch(dialog, /transaction-import-new-editor-memo/);
assert.doesNotMatch(dialog, /updateCandidateDetails\(candidate\.id, \{\s*memo:/);
assert.doesNotMatch(dialog, /updateCandidateDetails\(candidate\.id, \{\s*date:/);
assert.doesNotMatch(dialog, /updateCandidateDetails\(candidate\.id, \{\s*(?:inflow|outflow):/);

console.log("v3.17.6 shared import editor checks passed");
