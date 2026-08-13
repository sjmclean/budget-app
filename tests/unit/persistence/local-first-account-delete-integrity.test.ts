import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("account deletion guards transactions and scheduled transactions through one shared invariant", () => {
  assert.match(
    workerSource,
    /function assertAccountDeletable\(/,
    "worker must define one shared account-deletion guard",
  );

  const guardStart = workerSource.indexOf("function assertAccountDeletable(");
  const guardEnd = workerSource.indexOf("\nfunction ", guardStart + 1);

  assert.notEqual(guardStart, -1);
  assert.notEqual(guardEnd, -1);

  const guard = workerSource.slice(guardStart, guardEnd);

  assert.match(
    guard,
    /FROM local_transactions/,
    "account deletion must reject accounts containing transactions",
  );

  assert.match(
    guard,
    /FROM local_scheduled_transactions/,
    "account deletion must reject accounts referenced by scheduled transactions",
  );

  assert.match(
    guard,
    /transfer_account_id/,
    "account deletion must reject top-level transfer references",
  );

  assert.match(
    guard,
    /FROM local_transaction_splits/,
    "account deletion must reject split-transfer references",
  );

  const localDeleteStart = workerSource.indexOf("function deleteAccount(");
  const localDeleteEnd = workerSource.indexOf("\nfunction ", localDeleteStart + 1);
  const localDelete = workerSource.slice(localDeleteStart, localDeleteEnd);

  assert.match(
    localDelete,
    /assertAccountDeletable\(budgetId,\s*accountId\)/,
    "local deletion must use the shared guard",
  );

  const remoteAccountDelete =
    /mutation\.domain === "accounts"[\s\S]*?mutation\.operation === "delete"[\s\S]*?assertAccountDeletable\([\s\S]*?DELETE FROM local_accounts/;

  assert.match(
    workerSource,
    remoteAccountDelete,
    "remote account-delete replay must use the same guard before deleting",
  );
});
