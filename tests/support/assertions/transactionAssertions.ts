import assert from "node:assert/strict";
import type { SplitTransactionLine } from "../../../packages/types/src/SplitTransactionLine.js";
import type { Transaction } from "../../../packages/types/src/Transaction.js";
import { TransactionType } from "../../../packages/types/src/TransactionType.js";

export function assertSplitBalanced(transaction: Transaction, lines: SplitTransactionLine[]): void {
  assert.equal(transaction.type, TransactionType.Split, "Expected a split transaction");
  assert.equal(transaction.categoryId, null, "Split parent must not have a category");
  assert.equal(
    lines.reduce((sum, line) => sum + line.amount, 0),
    transaction.amount,
    "Expected split lines to equal the parent amount",
  );
  assert.deepEqual(
    lines.map((line) => line.sortOrder),
    lines.map((_, index) => index),
    "Expected split line ordering to be contiguous",
  );
}
