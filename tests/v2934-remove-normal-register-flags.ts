import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const drafts = readFileSync(
  "apps/web/src/features/accounts/registerTransactionDrafts.ts",
  "utf8",
);
const editor = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.doesNotMatch(drafts, /TransactionFlag|flag\?:|\bflag,?$/m);
assert.doesNotMatch(editor, /TransactionFlag|setFlag|transaction\.flag|\bflag,?$/m);
assert.doesNotMatch(page, /transaction-flag|Needs attention|Waiting for receipt|Review later/);
assert.doesNotMatch(registerCss, /\.transaction-flag|\.flag-colour-picker/);
assert.match(editor, /buildUpdateRegisterTransactionInput\(\{/);
assert.match(drafts, /buildNewRegisterTransactionInput/);

console.log("v2.93.4 normal register flag cleanup checks passed");
