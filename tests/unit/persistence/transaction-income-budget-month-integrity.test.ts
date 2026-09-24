import assert from "node:assert/strict";
import test from "node:test";

import { transactionRecord } from "../../../apps/web/src/features/persistence/localFirst/engine/transactionCommandHelpers.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

const baseWrite = {
  budgetId: "budget-a",
  accountId: "checking",
  date: "2026-09-24",
  amount: 10000,
  categoryId: "__ready_to_assign__",
  categoryName: "Ready to Assign",
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
    categoryId: "__ready_to_assign__",
    categoryName: "Ready to Assign",
    incomeBudgetMonth: "2026-11",
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
  assert.equal(record.incomeBudgetMonth, "2026-11");
});

test("persistence clears stale income allocation when the transaction is no longer Ready to Assign income", async () => {
  const expense = await transactionRecord(
    "income",
    {
      ...baseWrite,
      amount: -10000,
      incomeBudgetMonth: "2026-11",
    },
    existingIncome(),
  );
  assert.equal(expense.incomeBudgetMonth, null);

  const recategorised = await transactionRecord(
    "income",
    {
      ...baseWrite,
      categoryId: "salary-adjustment",
      categoryName: "Salary adjustment",
      incomeBudgetMonth: "2026-11",
    },
    existingIncome(),
  );
  assert.equal(recategorised.incomeBudgetMonth, null);

  const transfer = await transactionRecord(
    "income",
    {
      ...baseWrite,
      transferAccountId: "savings",
      incomeBudgetMonth: "2026-11",
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
    /cannot be earlier than transaction month/,
  );
  await assert.rejects(
    () => transactionRecord("income", {
      ...baseWrite,
      incomeBudgetMonth: "September 2026",
    }),
    /must use YYYY-MM/,
  );
});

test("split persistence applies the same Income for Month invariants", async () => {
  const record = await transactionRecord("split", {
    budgetId: "budget-a",
    accountId: "checking",
    date: "2026-09-24",
    amount: 15000,
    splitLines: [
      {
        id: "future-income",
        categoryId: "__ready_to_assign__",
        categoryName: "Ready to Assign",
        incomeBudgetMonth: "2026-12",
        amount: 10000,
      },
      {
        id: "expense",
        categoryId: "groceries",
        categoryName: "Groceries",
        incomeBudgetMonth: "2026-12",
        amount: 5000,
      },
    ],
  });

  assert.equal(record.splitLines[0]?.incomeBudgetMonth, "2026-12");
  assert.equal(record.splitLines[1]?.incomeBudgetMonth, null);
});
