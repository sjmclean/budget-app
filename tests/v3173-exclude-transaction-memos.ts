import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const commit = readFileSync(
  "apps/web/src/features/accounts/transactionImportCommit.ts",
  "utf8",
);

assert.match(dialog, /const \[excludeMemos, setExcludeMemos\] = useState\(false\)/);
assert.match(dialog, /includeMemos: !excludeMemos/);
assert.match(dialog, /checked=\{excludeMemos\}/);
assert.match(dialog, /Don\'t import transaction memos/);
assert.match(commit, /options\.includeMemos === false \? undefined : parsed\.memo/);

console.log("v3.17.3 exclude transaction memos checks passed");
