import assert from "node:assert/strict";
import test from "node:test";

import { transactionRecord } from "../../../apps/web/src/features/persistence/localFirst/engine/transactionCommandHelpers.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

const baseWrite = {
  budgetId: "budget-a",
  accountId: "checking",
  date: "2026-09-24",
  amount: 10000,
  categoryId: undefined,
  categoryName: "Uncategorised",
  incomeBudgetMonth: "2026-10",
  inflowClassification: "income",
};

function existingIncome(overrides: Partial<LocalTransactionRecord> = {}): LocalTransactionRecord {
  return {
    id: "income",
    budgetId: "budget-a",
    accountId: "checking",
    date: "2026-09-24",
    amount: 10000,
    memo: null,
    checkNumber: null,
    clearedStatus: "uncleared",
    payeeId: null,
    payeeName: "Employer",
    rawPayeeName: null,
    categoryId: null,
    categoryName: "Uncategorised",
    incomeBudgetMonth: "2026-10",
    inflowClassification: "income",
    transferAccountId: null,
    transferTransactionId: null,
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    importProvenance: [],
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

test("persistence retains a valid Income for Month through unrelated edits", async () => {
  const record = await transactionRecord(
    "income",
    { ...baseWrite, memo: "updated" },
    existingIncome(),
  );
  assert.equal(record.incomeBudgetMonth, "2026-10");
});

test("persistence clears stale income allocation when the transaction is no longer canonical general income", async () => {
  const expense = await transactionRecord(
    "income",
    {
      ...baseWrite,
      amount: -10000,
      incomeBudgetMonth: undefined,
      inflowClassification: undefined,
    },
    existingIncome(),
  );
  assert.equal(expense.incomeBudgetMonth, null);

  await assert.rejects(
    () => transactionRecord(
      "income",
      {
        ...baseWrite,
        categoryId: "salary-adjustment",
        categoryName: "Salary adjustment",
        incomeBudgetMonth: undefined,
        inflowClassification: undefined,
      },
      existingIncome(),
    ),
    /requires an explicit inflow classification/,
  );

  const recategorised = await transactionRecord(
    "income",
    {
      ...baseWrite,
      categoryId: "salary-adjustment",
      categoryName: "Salary adjustment",
      incomeBudgetMonth: undefined,
      inflowClassification: "category-inflow",
    },
    existingIncome(),
  );
  assert.equal(recategorised.incomeBudgetMonth, null);
  assert.equal(recategorised.inflowClassification, "category-inflow");

  const transfer = await transactionRecord(
    "income",
    {
      ...baseWrite,
      transferAccountId: "savings",
      incomeBudgetMonth: undefined,
      inflowClassification: undefined,
    },
    existingIncome(),
  );
  assert.equal(transfer.incomeBudgetMonth, null);
});

test("persistence rejects backdated or malformed Income for Month values", async () => {
  await assert.rejects(
    () => transactionRecord("income", {
      ...baseWrite,
      incomeBudgetMonth: "2026-08",
    }),
    /transaction month or the following month/,
  );
  await assert.rejects(
    () => transactionRecord("income", {
      ...baseWrite,
      incomeBudgetMonth: "September 2026",
    }),
    /transaction month or the following month/,
  );
});

test("split persistence keeps canonical general income isolated from category inflows", async () => {
  const record = await transactionRecord("split", {
    budgetId: "budget-a",
    accountId: "checking",
    date: "2026-09-24",
    amount: 15000,
    splitLines: [
      {
        id: "future-income",
        categoryId: undefined,
        categoryName: "Uncategorised",
        incomeBudgetMonth: "2026-10",
        inflowClassification: "income",
        amount: 10000,
      },
      {
        id: "refund",
        categoryId: "groceries",
        categoryName: "Groceries",
        inflowClassification: "category-inflow",
        amount: 5000,
      },
    ],
  });

  assert.equal(record.splitLines[0]?.incomeBudgetMonth, "2026-10");
  assert.equal(record.splitLines[0]?.inflowClassification, "income");
  assert.equal(record.splitLines[1]?.incomeBudgetMonth, null);
  assert.equal(record.splitLines[1]?.inflowClassification, "category-inflow");

  await assert.rejects(
    () => transactionRecord("invalid-split", {
      budgetId: "budget-a",
      accountId: "checking",
      date: "2026-09-24",
      amount: 5000,
      splitLines: [
        {
          id: "unclassified",
          categoryId: "groceries",
          categoryName: "Groceries",
          amount: 5000,
        },
      ],
    }),
    /requires an explicit inflow classification/,
  );
});
