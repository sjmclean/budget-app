import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workerSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("account navigation avoids joining and grouping every transaction", () => {
  const match = workerSource.match(
    /function listAccountNavigation\(budgetId: string\)\s*\{([\s\S]*?)\n\}/,
  );

  assert.ok(match, "listAccountNavigation should exist");

  const source = match[1];

  assert.doesNotMatch(
    source,
    /LEFT JOIN local_transactions AS transaction_row/,
    "account navigation should not materialise the full account/transaction join",
  );

  assert.doesNotMatch(
    source,
    /GROUP BY account\.id/,
    "account navigation should not group the entire joined transaction set",
  );

  assert.match(
    source,
    /SELECT SUM\(transaction_row\.amount\)[\s\S]*?WHERE transaction_row\.budget_id = account\.budget_id[\s\S]*?transaction_row\.account_id = account\.id/,
    "working balance should be derived by an indexed per-account ledger aggregate",
  );

  assert.match(
    source,
    /SELECT COUNT\(\*\)[\s\S]*?WHERE transaction_row\.budget_id = account\.budget_id[\s\S]*?transaction_row\.account_id = account\.id/,
    "transaction count should remain ledger-derived per account",
  );
});

test("account navigation reuses the boundary-aware uncategorised predicate", () => {
  const navigation = workerSource.match(
    /function listAccountNavigation\(budgetId: string\)\s*\{([\s\S]*?)\n\}/,
  );
  const predicate = workerSource.match(
    /function uncategorisedTransactionPredicate[\s\S]*?\n\}/,
  );

  assert.ok(navigation);
  assert.ok(predicate);
  assert.match(navigation[1], /uncategorisedTransactionPredicate\(\)/);
  assert.match(navigation[1], /account\.participation <> 'on-budget'/);

  const source = predicate[0];
  assert.match(source, /\.amount <> 0/);
  assert.match(source, /category_account\.participation = 'on-budget'/);
  assert.match(source, /transfer_category_account\.participation = 'on-budget'/);
  assert.match(source, /FROM local_transaction_splits AS category_split/);
  assert.match(source, /category_split\.category_id IS NULL/);
  assert.match(source, /split_transfer_category_account\.participation = 'on-budget'/);
  assert.doesNotMatch(source, /amount < 0/);
});
