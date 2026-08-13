import assert from "node:assert/strict";
import test from "node:test";

import { validateYnab4TransferIntegrity } from "../../../packages/ynab4-importer/src/transfers/validateYnab4TransferIntegrity.js";

function pairedTransfers(overrides: Record<string, unknown> = {}): {
  transactions: Array<Record<string, unknown>>;
} {
  return {
    transactions: [
      {
        entityId: "transfer-a",
        transferTransactionId: "transfer-b",
        accountId: "account-a",
        targetAccountId: "account-b",
        amount: -25,
        date: "2026-07-01",
        ...overrides,
      },
      {
        entityId: "transfer-b",
        transferTransactionId: "transfer-a",
        accountId: "account-b",
        targetAccountId: "account-a",
        amount: 25,
        date: "2026-07-01",
      },
    ],
  };
}

test("accepts a reciprocal equal-and-opposite transfer pair", () => {
  assert.doesNotThrow(() => validateYnab4TransferIntegrity(pairedTransfers()));
});

test("accepts equivalent milliunit transfer amounts", () => {
  const data = pairedTransfers();
  const [first, second] = data.transactions;
  delete first.amount;
  delete second.amount;
  first.amountMilliUnits = -25000;
  second.amountMilliUnits = 25000;

  assert.doesNotThrow(() => validateYnab4TransferIntegrity(data));
});

test("rejects a transfer whose pair is missing", () => {
  const data = pairedTransfers();
  data.transactions.pop();

  assert.throws(
    () => validateYnab4TransferIntegrity(data),
    /transfer pair transfer-b was not found/,
  );
});

test("rejects non-reciprocal transfer links", () => {
  const data = pairedTransfers();
  data.transactions[1].transferTransactionId = "another-transfer";

  assert.throws(
    () => validateYnab4TransferIntegrity(data),
    /does not link back reciprocally/,
  );
});

test("rejects account and amount mismatches", () => {
  const data = pairedTransfers();
  data.transactions[1].targetAccountId = "account-c";
  data.transactions[1].amount = 20;

  assert.throws(
    () => validateYnab4TransferIntegrity(data),
    (error: unknown) => {
      if (!(error instanceof Error)) return false;
      assert.match(error.message, /account relationship does not match/);
      assert.match(error.message, /amounts are not equal and opposite/);
      return true;
    },
  );
});

test("rejects self-transfers and date mismatches", () => {
  const data = pairedTransfers({ targetAccountId: "account-a" });
  data.transactions[1].date = "2026-07-02";

  assert.throws(
    () => validateYnab4TransferIntegrity(data),
    (error: unknown) => {
      if (!(error instanceof Error)) return false;
      assert.match(error.message, /source and target accounts must differ/);
      assert.match(error.message, /dates do not match/);
      return true;
    },
  );
});

test("ignores tombstoned transfer rows", () => {
  const data = pairedTransfers({ isTombstone: true });
  data.transactions[1].isTombstone = true;
  assert.doesNotThrow(() => validateYnab4TransferIntegrity(data));
});

test("accepts a split transfer paired with a destination transaction", () => {
  const data = {
    transactions: [
      {
        entityId: "split-parent",
        accountId: "account-a",
        date: "2026-07-03",
        amount: -40,
        categoryId: "Category/__Split__",
        subTransactions: [
          {
            entityId: "split-transfer",
            transferTransactionId: "transfer-destination",
            targetAccountId: "account-b",
            amount: -25,
          },
          {
            entityId: "split-expense",
            amount: -15,
            categoryId: "category-a",
          },
        ],
      },
      {
        entityId: "transfer-destination",
        transferTransactionId: "split-transfer",
        accountId: "account-b",
        targetAccountId: "account-a",
        amount: 25,
        date: "2026-07-03",
      },
    ],
  };

  assert.doesNotThrow(() => validateYnab4TransferIntegrity(data));
});

test("rejects an invalid split transfer pair", () => {
  const data = {
    transactions: [
      {
        entityId: "split-parent",
        accountId: "account-a",
        date: "2026-07-03",
        amount: -25,
        categoryId: "Category/__Split__",
        subTransactions: [
          {
            entityId: "split-transfer",
            transferTransactionId: "transfer-destination",
            targetAccountId: "account-b",
            amount: -25,
          },
        ],
      },
      {
        entityId: "transfer-destination",
        transferTransactionId: "split-transfer",
        accountId: "account-c",
        targetAccountId: "account-a",
        amount: 20,
        date: "2026-07-03",
      },
    ],
  };

  assert.throws(
    () => validateYnab4TransferIntegrity(data),
    (error: unknown) => {
      if (!(error instanceof Error)) return false;
      assert.match(error.message, /account relationship does not match/);
      assert.match(error.message, /amounts are not equal and opposite/);
      return true;
    },
  );
});
