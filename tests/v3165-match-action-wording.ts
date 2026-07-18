import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(
  dialog,
  /candidate\.status === "exact-match"[\s\S]*?>\s*Use Existing\s*</,
  "exact matches should use the existing register transaction",
);
assert.match(
  dialog,
  /candidate\.status === "possible-match"[\s\S]*?>\s*Match\s*</,
  "possible matches should expose a Match action",
);
assert.equal(
  (dialog.match(/>\s*Not a Match\s*</g) ?? []).length,
  2,
  "exact and possible matches should both expose Not a Match",
);
assert.doesNotMatch(
  dialog,
  />\s*Accept Match\s*</,
  "the obsolete Accept Match label should be removed",
);
assert.doesNotMatch(
  dialog,
  />\s*Import Anyway\s*</,
  "the ambiguous Import Anyway label should not return",
);

console.log("v3.16.5 match action wording checks passed");
