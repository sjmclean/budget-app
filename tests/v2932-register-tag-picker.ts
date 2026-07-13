import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rowSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const pageSource = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(rowSource, /function TransactionTagPicker/);
assert.match(rowSource, /aria-label="Transaction tags"/);
assert.match(rowSource, /checked=\{assignedTagIds\.includes\(tag\.id\)\}/);
assert.match(rowSource, /onUpdateTransactionTags\(transaction, tagIds\)/);
assert.match(rowSource, /More → Manage Tags/);
assert.doesNotMatch(rowSource, /function InlineFlagPicker/);

assert.match(pageSource, /tagIds,/);
assert.match(pageSource, /onUpdateTransactionTags=\{handleUpdateTransactionTags\}/);
assert.match(pageSource, /setTransactionTags\(transactionTagService\.listTags\(\)\)/);

assert.match(registerCss, /\.transaction-tag-picker-menu/);
assert.match(registerCss, /\.transaction-tag-picker-option/);

console.log("v2.93.2 register tag picker checks passed");
