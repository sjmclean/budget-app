import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("account register SQLite readback hydrates split Income for Month", () => {
  assert.match(
    workerSource,
    /SELECT split\.transaction_id AS transactionId, split\.id,[\s\S]*?split\.income_budget_month AS incomeBudgetMonth,[\s\S]*?FROM local_transaction_splits AS split/,
    "register split rows must read income_budget_month from SQLite",
  );
});

test("transaction batch verification compares parent and split Income for Month", () => {
  assert.match(
    workerSource,
    /normaliseTransactionRecord[\s\S]*?incomeBudgetMonth: transaction\.incomeBudgetMonth,[\s\S]*?incomeBudgetMonth: line\.incomeBudgetMonth,/,
    "post-write verification must include Income for Month metadata",
  );
});


import { mapSqliteTransactions } from "../../../apps/web/src/features/accounts/useAccountRegister.js";

test("canonical split income maps back to Income for Month in the Register", () => {
  const [transaction] = mapSqliteTransactions([
    {
      id: "transaction-1",
      date: "2026-09-26",
      amount: 12000,
      memo: null,
      checkNumber: null,
      clearedStatus: "uncleared",
      payeeId: null,
      payeeName: "Employer",
      categoryId: null,
      categoryName: null,
      transferAccountId: null,
      transferTransactionId: null,
      splitLines: [
        {
          id: "income-line",
          categoryId: null,
          categoryName: null,
          incomeBudgetMonth: "2026-09",
          inflowClassification: "income",
          transferAccountId: null,
          transferTransactionId: null,
          memo: null,
          amount: 10000,
        },
        {
          id: "fuel-line",
          categoryId: "fuel",
          categoryName: "Fuel",
          incomeBudgetMonth: null,
          inflowClassification: "category-inflow",
          transferAccountId: null,
          transferTransactionId: null,
          memo: null,
          amount: 2000,
        },
      ],
    },
  ], 12000);

  assert.equal(transaction?.splitLines?.[0]?.category, "Income for September 2026");
  assert.equal(transaction?.splitLines?.[1]?.category, "Fuel");
});
