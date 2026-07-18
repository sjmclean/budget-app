import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(dialog, /Analysing transactions…/);
assert.match(dialog, /setIsAnalysing\(true\)/);
assert.match(dialog, /finally\s*\{\s*setIsAnalysing\(false\)/);
assert.match(dialog, /<PayeeInput/);
assert.match(dialog, /<RegisterCategoryInput/);
assert.match(dialog, /onCreatePayee=\{onCreatePayee\}/);
assert.match(dialog, /onCreateCategory=\{onCreateCategory\}/);
assert.ok(dialog.includes("/^Transfer:\\s*(.+)$/i"));
assert.match(page, /payeeOptions=\{payeeOptions\}/);
assert.match(page, /categoryOptions=\{categoryOptions\}/);
assert.match(page, /onCreatePayee=\{createInlinePayee\}/);
assert.match(page, /onCreateCategory=\{createInlineCategory\}/);
assert.match(css, /\.transaction-import-spinner/);

console.log("v3.18.1 import analysis and register selector checks passed");
