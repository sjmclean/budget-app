import assert from "node:assert/strict";
import test from "node:test";
import { planReconciliationCompletion } from "../../../apps/web/src/features/accounts/reconciliationCompletion.ts";

const transactions = [
  { id: "old", accountId: "a", date: "2026-09-02", amount: -200, clearedStatus: "reconciled" },
  { id: "new", accountId: "a", date: "2026-09-10", amount: -300, clearedStatus: "cleared" },
  { id: "pending", accountId: "a", date: "2026-09-11", amount: -400, clearedStatus: "uncleared" },
  { id: "future", accountId: "a", date: "2026-10-01", amount: -500, clearedStatus: "cleared" },
] as const;
const input = { accountId: "a", statementDate: "2026-09-30", statementBalanceMinor: 500, openingBalanceMinor: 1000, transactions };

test("reconciliation completes only eligible cleared transactions and includes previous reconciled amounts", () => {
  assert.deepEqual(planReconciliationCompletion(input), {
    transactionIds: ["new"], clearedBalanceMinor: 500, statementBalanceMinor: 500, statementDate: "2026-09-30",
  });
});

test("mismatched statement amount does not produce a completion plan", () => {
  assert.throws(() => planReconciliationCompletion({ ...input, statementBalanceMinor: 501 }), /does not match/);
});

test("transactions from other accounts are rejected, even when uncleared", () => {
  assert.throws(() => planReconciliationCompletion({
    ...input, transactions: [...transactions, { id: "wrong", accountId: "b", date: "2026-09-01", amount: 1, clearedStatus: "uncleared" }],
  }), /another account/);
});

test("invalid statement date and fractional money are rejected", () => {
  assert.throws(() => planReconciliationCompletion({ ...input, statementDate: "2026-02-30" }), /Invalid reconciliation statement date/);
  assert.throws(() => planReconciliationCompletion({ ...input, statementBalanceMinor: 500.1 }), /integer minor units/);
});

test("invalid and duplicate transaction records are rejected", () => {
  assert.throws(() => planReconciliationCompletion({ ...input, transactions: [...transactions, transactions[0]] }), /Duplicate/);
  assert.throws(() => planReconciliationCompletion({ ...input, transactions: [{ ...transactions[0], clearedStatus: "invalid" }] }), /Unknown/);
});

test("reconciliation does not change an uncleared transfer counterpart in another account", () => {
  const transferSide = { id: "transfer-a", accountId: "a", date: "2026-09-12", amount: -100, clearedStatus: "cleared" };
  const result = planReconciliationCompletion({
    accountId: "a",
    statementDate: "2026-09-30",
    statementBalanceMinor: 900,
    openingBalanceMinor: 1000,
    transactions: [transferSide],
  });
  assert.deepEqual(result.transactionIds, ["transfer-a"]);
});

test("a reconciled item remains included in balances without being reconciled twice", () => {
  const result = planReconciliationCompletion({
    accountId: "a", statementDate: "2026-09-30", statementBalanceMinor: 800,
    openingBalanceMinor: 1000,
    transactions: [{ id: "already-done", accountId: "a", date: "2026-09-01", amount: -200, clearedStatus: "reconciled" }],
  });
  assert.deepEqual(result.transactionIds, []);
});

test("a cleared transaction dated after the statement does not affect reconciliation", () => {
  const result = planReconciliationCompletion({
    accountId: "a", statementDate: "2026-09-30", statementBalanceMinor: 1000,
    openingBalanceMinor: 1000,
    transactions: [{ id: "later", accountId: "a", date: "2026-10-01", amount: -250, clearedStatus: "cleared" }],
  });
  assert.deepEqual(result.transactionIds, []);
});
