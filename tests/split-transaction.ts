import assert from "node:assert/strict";
import { createSplitTransaction } from "../packages/budget-engine/src/services/createSplitTransaction.js";
import { assertSplitBalanced } from "./support/assertions/transactionAssertions.js";

const split = createSplitTransaction({
  budgetId: "budget",
  accountId: "checking",
  payeeId: "woolworths",
  date: "2026-06-17",
  amount: -12_000,
  lines: [
    { categoryId: "groceries", amount: -8_000 },
    { categoryId: "household", amount: -4_000 },
  ],
});

assertSplitBalanced(split.transaction, split.lines);
assert.equal(split.transaction.payeeId, "woolworths");
assert.deepEqual(split.lines.map((line) => line.categoryId), ["groceries", "household"]);
assert.throws(
  () => createSplitTransaction({ ...split.transaction, lines: [{ categoryId: "groceries", amount: -8_000 }] }),
  /split/i,
);
