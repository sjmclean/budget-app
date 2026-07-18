import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);

assert.match(
  dialog,
  /onClick=\{\(\) => importCandidate\(candidate\.id\)\}[\s\S]*?>\s*Accept\s*<\/button>/,
);
assert.doesNotMatch(
  dialog,
  /onClick=\{\(\) => importCandidate\(candidate\.id\)\}[\s\S]*?>\s*Import\s*<\/button>/,
);

console.log("New transaction Accept action checks passed");
