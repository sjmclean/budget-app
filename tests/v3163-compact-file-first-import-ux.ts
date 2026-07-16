import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(dialog, /Select a file, check the preview, then import\./);
assert.doesNotMatch(dialog, /transaction-import-steps/);
assert.doesNotMatch(dialog, /SUPPORTED_IMPORT_FORMATS/);
assert.match(dialog, /transaction-import-preview-toolbar/);
assert.match(dialog, /Destination account/);
assert.match(dialog, /transaction-import-inline-settings/);
assert.match(dialog, /updateQifInterpretation/);
assert.match(dialog, /changeDestinationAccount/);
assert.doesNotMatch(
  dialog,
  /Destination account changed\. Re-select the file/,
);
assert.match(dialog, /previewTransactionQifImport\(\s*qifText,\s*nextTransactions/);
assert.match(dialog, /previewTransactionOfxImport\(\s*ofxText,\s*nextTransactions/);
assert.match(dialog, /previewTransactionCsvImport\(\s*csvText,\s*nextTransactions/);
assert.match(styles, /width: min\(780px, calc\(100vw - 2rem\)\)/);
assert.match(styles, /max-height: min\(620px, calc\(100vh - 2rem\)\)/);
assert.match(styles, /min-height: 150px/);

console.log("v3.16.3 compact file-first import UX checks passed");
