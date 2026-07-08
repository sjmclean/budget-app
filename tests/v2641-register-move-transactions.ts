import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(
  "apps/web/src/features/accounts/accountRegisterService.ts",
  "utf8",
);
const types = readFileSync(
  "apps/web/src/features/accounts/accountRegisterTypes.ts",
  "utf8",
);
const hook = readFileSync(
  "apps/web/src/features/accounts/useAccountRegister.ts",
  "utf8",
);
const selectionActions = readFileSync(
  "apps/web/src/features/accounts/useRegisterSelectionActions.ts",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(
  types,
  /moveTransactions\(input:\s*\{\s*sourceAccountId: string;\s*targetAccountId: string;\s*transactionIds: string\[\];\s*\}\): Promise<AccountRegisterView>/s,
  "register service contract should expose moveTransactions",
);

assert.match(
  service,
  /async moveTransactions\(input:\s*\{\s*sourceAccountId: string;\s*targetAccountId: string;\s*transactionIds: string\[\];\s*\}\): Promise<AccountRegisterView>/s,
  "browser register service should implement moveTransactions",
);

assert.match(service, /input\.sourceAccountId === input\.targetAccountId/);
assert.match(service, /transaction\.reconciled/);
assert.match(
  service,
  /transaction\.transferId[\s\S]*transaction\.transferAccountId[\s\S]*transaction\.transferTransactionId/,
);
assert.match(service, /sourceRegister\.transactions = sourceRegister\.transactions\.filter/);
assert.match(service, /targetRegister\.transactions = \[/);
assert.match(service, /registers\[input\.sourceAccountId\] = recalculateRegister/);
assert.match(service, /registers\[input\.targetAccountId\] = recalculateRegister/);

assert.match(
  hook,
  /moveTransactions:\s*\(\s*targetAccountId: string,\s*transactionIds: string\[\],\s*\) => Promise<void>/s,
);
assert.match(selectionActions, /id: "move"/);
assert.match(selectionActions, /MoveRight/);
assert.match(page, /isMoveTransactionDialogOpen/);
assert.match(page, /openMoveTransactions: openMoveTransactionDialog/);
assert.match(page, /Destination account/);
assert.match(
  page,
  /account\.id !== accountId && !account\.closedAt/,
  "move account picker should exclude closed accounts",
);
assert.match(css, /\.register-move-overlay/);

console.log("v2.64.1 register move transaction checks passed");
