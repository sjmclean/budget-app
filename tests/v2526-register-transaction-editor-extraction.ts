import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const transactionEditor = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  ),
  "utf8",
);

assert.match(
  registerPage,
  /from "\.\.\/features\/accounts\/components\/RegisterTransactionEditor"/,
  "Register page should import the extracted transaction editor rows",
);
assert.match(registerPage, /<TransactionEntryRow/);
assert.match(registerPage, /<TransactionEditRow/);
assert.doesNotMatch(registerPage, /function TransactionEntryRow/);
assert.doesNotMatch(registerPage, /function TransactionEditRow/);
assert.doesNotMatch(registerPage, /function SplitEditor/);
assert.doesNotMatch(registerPage, /function PayeeInput/);
assert.doesNotMatch(registerPage, /function CategoryInput/);

assert.match(
  transactionEditor,
  /export function TransactionEntryRow/,
  "Extracted transaction editor should export the entry row",
);
assert.match(
  transactionEditor,
  /export function TransactionEditRow/,
  "Extracted transaction editor should export the edit row",
);
assert.match(
  transactionEditor,
  /function SplitEditor/,
  "Split editing should live with the transaction editor workflow",
);
assert.match(
  transactionEditor,
  /function PayeeInput/,
  "Payee entry autocomplete should live with the transaction editor workflow",
);
assert.match(
  transactionEditor,
  /function CategoryInput/,
  "Category entry autocomplete should live with the transaction editor workflow",
);
assert.match(
  transactionEditor,
  /RegisterDateField/,
  "Extracted transaction editor should reuse the shared date field",
);
assert.match(
  transactionEditor,
  /isRegisterEntryInputColumn/,
  "Extracted transaction editor should reuse shared column helpers",
);

console.log("v2.52.6 register transaction editor extraction checks passed");
