import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const registerService = readFileSync("apps/web/src/features/accounts/accountRegisterService.ts", "utf8");

assert.match(
  registerPage,
  /function InlineFlagPicker/,
  "Register page should expose an inline flag picker.",
);

assert.match(
  registerPage,
  /onUpdateTransactionFlag=\{handleUpdateTransactionFlag\}/,
  "Transaction rows should update flags without opening the edit row.",
);

assert.match(
  registerPage,
  /<InlineFlagPicker\s+value=\{transaction\.flag\}/,
  "Normal register rows should render the inline flag picker.",
);

assert.match(
  registerPage,
  /<InlineFlagPicker value=\{flag\} onChange=\{setFlag\}/,
  "Editing rows should allow flag changes before saving.",
);

assert.match(
  registerPage,
  /onClick=\{\(\) => onManageTransactionAttachments\(transaction\.id\)\}/,
  "Editing rows should keep the attachment action available.",
);

assert.match(
  registerService,
  /flag: input\.transaction\.flag === undefined \? transaction\.flag : input\.transaction\.flag/,
  "Register updates must allow clearing a flag back to no flag.",
);

assert.match(
  registerService,
  /flag: input\.transaction\.flag === undefined \? existing\.flag : input\.transaction\.flag/,
  "Transfer transaction updates must preserve or clear flags consistently.",
);

console.log("v2.02 inline register actions checks passed");
