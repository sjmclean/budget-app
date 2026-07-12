import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbarSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);
const registerPageSource = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);

assert.match(toolbarSource, /onOpenTagManager: \(\) => void/);
assert.match(toolbarSource, /Manage Tags/);
assert.match(
  registerPageSource,
  /createTransactionTagService\(\{[\s\S]*?createBudgetScopedStorage/,
);
assert.match(
  registerPageSource,
  /<TransactionTagManager service=\{transactionTagService\} \/>/,
);
assert.match(
  registerPageSource,
  /onOpenTagManager=\{\(\) => setIsTransactionTagManagerOpen\(true\)\}/,
);

console.log("v2.92.2 register tag manager entry point checks passed");
