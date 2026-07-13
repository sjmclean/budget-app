import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const transactionRow = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const registerService = readFileSync(
  "apps/web/src/features/accounts/accountRegisterService.ts",
  "utf8",
);

assert.match(
  transactionRow,
  /function TransactionTagPicker/,
  "Register rows should expose the inline transaction tag picker.",
);
assert.match(
  transactionRow,
  /onUpdateTransactionTags\(transaction, tagIds\)/,
  "Transaction rows should update tags without opening the edit row.",
);
assert.match(
  transactionRow,
  /onManageTransactionAttachments\(transaction\.id\)/,
  "Register rows should keep the attachment action available.",
);
assert.match(
  registerPage,
  /onUpdateTransactionTags=\{handleUpdateTransactionTags\}/,
  "The register page should persist inline tag assignments.",
);
assert.doesNotMatch(
  transactionRow,
  /InlineFlagPicker|transaction\.flag|onUpdateTransactionFlag/,
  "The inline register workflow should not expose legacy flags.",
);
assert.doesNotMatch(
  registerService,
  /input\.transaction\.flag|existing\.flag|transaction\.flag/,
  "Register updates should no longer preserve or edit legacy flags.",
);

console.log("v2.02 inline register actions checks passed");
