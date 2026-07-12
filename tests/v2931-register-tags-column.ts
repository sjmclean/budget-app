import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const row = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const columns = readFileSync(
  "apps/web/src/features/accounts/registerColumns.ts",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const commands = readFileSync(
  "apps/web/src/features/accounts/useRegisterCommands.ts",
  "utf8",
);

assert.match(columns, /id: "tags", label: "Tags"/);
assert.doesNotMatch(columns, /id: "flag"|label: "Flag"/);
assert.match(row, /function TransactionTagIndicator/);
assert.match(row, /transaction\.tagIds\?\.includes\(tag\.id\)/);
assert.match(row, /<Tag size=\{15\}/);
assert.match(row, /assignedTags\.length > 1/);
assert.doesNotMatch(row, /InlineFlagPicker|REGISTER_FLAG_OPTIONS|onUpdateTransactionFlag/);
assert.match(page, /register-compact-head-tags">Tags/);
assert.match(page, /tags=\{transactionTags\}/);
assert.doesNotMatch(commands, /updateTransactionFlag|TransactionFlag/);

console.log("v2.93.1 register tags column checks passed");
