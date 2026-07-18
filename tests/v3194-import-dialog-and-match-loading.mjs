import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(
  new URL("../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
  "utf8",
);
const dialog = readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);

assert.match(page, /onOpenImport=\{\(\) => setIsTransactionImportOpen\(true\)\}/);
assert.doesNotMatch(page, /transactionImportFileInputRef|pendingImportFile|initialFile=/);
assert.match(dialog, /Drop your transaction file here/);
assert.match(dialog, /or click to browse files/);
assert.match(
  dialog,
  /const \[bootstrappedKnowledge, currentTransactions\] = await Promise\.all/,
);
assert.match(dialog, /loadAccountTransactions\(selectedAccountId\)/);
assert.match(
  dialog,
  /previewTransactionQifImport\([\s\S]*?currentTransactions/,
);
assert.match(
  dialog,
  /previewTransactionOfxImport\([\s\S]*?currentTransactions/,
);
assert.match(dialog, /existingTransactions: currentTransactions/);

console.log("Import dialog and current-register matching checks passed");
