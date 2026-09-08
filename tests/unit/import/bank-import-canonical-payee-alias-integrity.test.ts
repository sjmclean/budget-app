import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

test("canonical aliases are learned only from explicit review ownership or changed matched payees", () => {
  assert.match(dialog, /manualCandidateEdits\[candidate\.id\]\?\.payee/);
  assert.match(dialog, /const origin = matchedTransactionOrigins\[candidate\.id\]/);
  assert.match(dialog, /rawIdentity !== targetIdentity/);
});

test("canonical alias writes happen after the import commit succeeds", () => {
  const commit = dialog.indexOf("const result = await commitImportSession(");
  const learn = dialog.indexOf("await onLearnPayeeAlias(payeeId, learning.rawPayee)");
  assert.ok(commit >= 0);
  assert.ok(learn > commit);
});

test("accepted alias suggestions are mirrored into canonical payee aliases", () => {
  assert.match(
    dialog,
    /await onLearnPayeeAlias\(canonicalPayee\.id, suggestion\.sourcePayee\)/,
  );
});
