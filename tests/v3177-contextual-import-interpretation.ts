import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.match(dialog, /transaction-import-header-account/);
assert.doesNotMatch(dialog, /transaction-import-preview-toolbar/);
assert.doesNotMatch(dialog, /transaction-import-detection-panel/);
assert.doesNotMatch(dialog, />Edit File Settings</);
assert.doesNotMatch(dialog, /transaction-import-inline-settings/);
assert.match(dialog, /Confirm how this file should be read/);
assert.match(dialog, /remembered for \{accountName\}/);
assert.match(dialog, /accountId: selectedAccountId/);
assert.match(dialog, /structureSignature: createQifStructureSignature\(qifText\)/);
assert.match(dialog, /qifDateInterpretationResolved/);
assert.match(dialog, /qifAmountInterpretationResolved/);
assert.doesNotMatch(dialog, /and JSON files/);

console.log("v3.17.7 contextual import interpretation checks passed");
