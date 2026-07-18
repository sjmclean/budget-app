import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  new URL(
    "../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);
const payeeInput = readFileSync(
  new URL(
    "../apps/web/src/features/accounts/components/PayeeInput.tsx",
    import.meta.url,
  ),
  "utf8",
);
const categoryInput = readFileSync(
  new URL(
    "../apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
    import.meta.url,
  ),
  "utf8",
);

assert.match(dialog, /Proposed register transaction/);
assert.match(dialog, /onDoubleClick=.*beginProposedTransactionEdit/s);
assert.match(dialog, /Double-click the payee or category/);
assert.doesNotMatch(dialog, /className="transaction-import-new-editor"/);
assert.match(dialog, /onBlurOutside=\{cancelProposedTransactionEdit\}/);
assert.match(dialog, /onSelection=\{\(value\) =>/);
assert.match(payeeInput, /onSelection\?\.\(selectedValue\)/);
assert.match(payeeInput, /onBlurOutside\?\.\(\)/);
assert.match(categoryInput, /onSelection\?\.\(nextValue\)/);
assert.match(categoryInput, /onBlurOutside\?\.\(\)/);

console.log("v3.18.5 proposed register transaction review checks passed");
