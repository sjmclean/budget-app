import assert from "node:assert/strict";
import test from "node:test";
import { deriveTransactionChangeScope } from "../../../apps/web/src/features/persistence/localFirst/persistenceChangeImpact.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

function transaction(overrides: Partial<LocalTransactionRecord> = {}): LocalTransactionRecord {
  return {
    id: "tx-1", budgetId: "budget-a", accountId: "account-a", date: "2026-09-10",
    amount: -1000, memo: null, checkNumber: null, clearedStatus: "uncleared",
    payeeId: null, payeeName: null, categoryId: "groceries", categoryName: "Groceries",
    transferAccountId: null, transferTransactionId: null, generatedFromSchedule: false,
    scheduledTransactionId: null, scheduledOccurrenceDate: null, splitLines: [], tagIds: [],
    importProvenance: [], updatedAt: "2026-09-16T00:00:00.000Z", ...overrides,
  };
}

test("transaction transition invalidates old and new account, month, category and transfer scopes", () => {
  const scope = deriveTransactionChangeScope({
    budgetId: "budget-a",
    before: [transaction({ transferAccountId: "account-transfer-old" })],
    after: [transaction({ accountId: "account-b", transferAccountId: "account-transfer-new", date: "2026-10-01", categoryId: "dining" })],
  });
  assert.deepEqual(scope.accountIds, ["account-a", "account-b", "account-transfer-new", "account-transfer-old"]);
  assert.deepEqual(scope.months, ["2026-09", "2026-10"]);
  assert.deepEqual(scope.categoryIds, ["dining", "groceries"]);
  assert.deepEqual(scope.transactionIds, ["tx-1"]);
});

test("delete uses the old entity and restore uses the restored entity", () => {
  const old = transaction();
  const deletion = deriveTransactionChangeScope({ budgetId: "budget-a", before: [old] });
  const restore = deriveTransactionChangeScope({ budgetId: "budget-a", after: [old] });
  assert.deepEqual(deletion, restore);
  assert.deepEqual(deletion.accountIds, ["account-a"]);
  assert.deepEqual(deletion.months, ["2026-09"]);
  assert.deepEqual(deletion.categoryIds, ["groceries"]);
});

test("non-financial transaction edits do not invalidate budget projections", () => {
  const before = transaction();
  const scope = deriveTransactionChangeScope({
    budgetId: "budget-a",
    before: [before],
    after: [{ ...before, memo: "updated", clearedStatus: "cleared", payeeName: "Renamed" }],
  });
  assert.deepEqual(scope.domains, ["transactions"]);
});
