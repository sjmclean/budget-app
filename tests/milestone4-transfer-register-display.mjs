import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, registerProjection] = await Promise.all([
  readFile(
    "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    "utf8",
  ),
  readFile("apps/web/src/features/accounts/useAccountRegister.ts", "utf8"),
]);

assert.match(
  worker,
  /LEFT JOIN local_accounts AS transfer_account\s+ON transfer_account\.budget_id = transaction_row\.budget_id\s+AND transfer_account\.id = transaction_row\.transfer_account_id/,
);
assert.match(worker, /transfer_account\.name AS transferAccountName/);
assert.match(
  worker,
  /LEFT JOIN local_accounts AS transfer_account\s+ON transfer_account\.id = split\.transfer_account_id/,
);

assert.match(
  registerProjection,
  /row\.transferAccountId\s*\?\s*formatTransferPayee\(readTransferAccountName\(row\)\)/,
);
assert.match(
  registerProjection,
  /line\.transferAccountId\s*\?\s*formatTransferPayee\(readTransferAccountName\(line\)\)/,
);
assert.match(
  registerProjection,
  /return `Transfer: \$\{accountName \?\? "Unknown account"\}`/,
);
assert.doesNotMatch(
  registerProjection,
  /row\.payeeName \?\? \(row\.transferAccountId \? "Transfer"/,
);

console.log(
  "Milestone 4 transfer register display contracts passed: counterpart account names and damaged-link fallback.",
);
