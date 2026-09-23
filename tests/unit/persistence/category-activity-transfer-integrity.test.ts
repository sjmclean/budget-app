import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("category activity drilldown mirrors off-budget transfer activity semantics", () => {
  const start = worker.indexOf("function getCategoryActivityDrilldown");
  const end = worker.indexOf("function queryTransactions", start);
  assert.ok(start >= 0 && end > start);
  const drilldown = worker.slice(start, end);

  assert.match(
    drilldown,
    /LEFT JOIN local_accounts AS transfer_account[\s\S]*transfer_account\.participation = 'off-budget'/,
  );
  assert.match(
    drilldown,
    /LEFT JOIN local_accounts AS split_transfer_account[\s\S]*split_transfer_account\.participation = 'off-budget'/,
  );
  assert.match(
    drilldown,
    /transaction_row\.transfer_account_id IS NULL[\s\S]*OR transfer_account\.participation = 'off-budget'/,
  );
  assert.match(
    drilldown,
    /split\.transfer_account_id IS NULL[\s\S]*OR split_transfer_account\.participation = 'off-budget'/,
  );
  assert.match(drilldown, /account\.participation = 'on-budget'/);
  assert.match(
    drilldown,
    /WHEN transaction_row\.amount < 0[\s\S]*'Transfer to '[\s\S]*'Transfer from '/,
  );
  assert.match(
    drilldown,
    /WHEN split\.amount < 0[\s\S]*'Transfer to '[\s\S]*'Transfer from '/,
  );
  assert.match(drilldown, /transfer_account\.name/);
  assert.match(drilldown, /split_transfer_account\.name/);
  assert.match(
    drilldown,
    /Category activity details do not reconcile with the budget engine/,
  );
});
