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
