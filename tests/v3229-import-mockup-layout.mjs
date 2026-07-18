import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(dialog, /transaction-import-upload-account/);
assert.doesNotMatch(dialog, /transaction-import-header-account/);
assert.match(dialog, /transaction-import-close-button/);
assert.match(dialog, /Using existing transaction/);
assert.match(dialog, /<b>A<\/b>/);
assert.match(dialog, /<b>B<\/b>/);
assert.match(dialog, /<span>Register<\/span>/);
assert.match(dialog, /transaction-import-setup-grid/);
assert.match(styles, /v3\.22\.9 importer mockup-aligned visual composition/);
assert.match(styles, /width: min\(1040px/);
assert.match(styles, /transaction-import-review-card-exact-match \.transaction-import-review-kind/);
assert.match(styles, /transaction-import-review-card-new \.transaction-import-review-kind/);
assert.match(styles, /transaction-import-review-card-invalid \.transaction-import-review-kind/);
assert.match(styles, /transaction-import-upload-account/);

console.log("v3.22.9 importer mockup layout structure tests passed");
