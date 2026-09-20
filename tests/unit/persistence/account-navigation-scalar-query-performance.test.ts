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
const runtimeSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);
const sidebarSource = fs.readFileSync(
  new URL("../../../apps/web/src/layouts/Sidebar.tsx", import.meta.url),
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
  const predicateSource = fs.readFileSync(
    new URL(
      "../../../apps/web/src/features/persistence/localFirst/uncategorisedTransactionSql.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.ok(navigation);
  assert.match(navigation[1], /uncategorisedTransactionPredicate\(\)/);
  assert.match(navigation[1], /account\.participation <> 'on-budget'/);

  const source = predicateSource;
  assert.match(source, /\.amount <> 0/);
  assert.match(source, /category_account\.participation = 'on-budget'/);
  assert.match(source, /transfer_transaction_id IS NULL/);
  assert.match(source, /transfer_category_account\.participation = 'on-budget'/);
  assert.match(source, /FROM local_transaction_splits AS category_split/);
  assert.match(source, /category_split\.category_id IS NULL/);
  assert.match(source, /category_split\.transfer_transaction_id IS NULL/);
  assert.match(source, /split_transfer_category_account\.participation = 'on-budget'/);
  assert.doesNotMatch(source, /amount < 0/);
});


test("account identity reads do not derive transaction navigation state", () => {
  const match = workerSource.match(
    /function listAccounts\(budgetId: string\)\s*\{([\s\S]*?)\n\}/,
  );
  assert.ok(match, "listAccounts should exist");
  assert.match(match[1], /FROM local_accounts/);
  assert.doesNotMatch(match[1], /local_transactions/);
  assert.doesNotMatch(match[1], /local_transaction_splits/);

  const runtimeListAccounts = runtimeSource.match(
    /async listAccounts\(budgetId\)\s*\{([\s\S]*?)\n    \},/,
  );
  assert.ok(runtimeListAccounts, "runtime listAccounts should exist");
  assert.match(runtimeListAccounts[1], /local\.listAccounts\(budgetId\)/);
  assert.doesNotMatch(runtimeListAccounts[1], /listAccountNavigation/);
});

test("sidebar shares the reactive account navigation read instead of issuing its own", () => {
  assert.match(sidebarSource, /useAccountNavigationQuery/);
  assert.doesNotMatch(sidebarSource, /accountRegisterQueries\.getBudgetStatus\(/);
  assert.doesNotMatch(sidebarSource, /accountRegisterQueries!?\.listAccountNavigation\(/);
});
