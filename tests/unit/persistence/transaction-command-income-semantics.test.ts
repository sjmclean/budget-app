import assert from "node:assert/strict";
import test from "node:test";

import {
  transactionRecord,
} from "../../../apps/web/src/features/persistence/localFirst/engine/transactionCommandHelpers.js";
import type {
  LocalTransactionRecord,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

function existingTransaction(
  overrides: Partial<LocalTransactionRecord> = {},
): LocalTransactionRecord {
  return {
    id: "transaction-1",
    budgetId: "budget-1",
    accountId: "checking",
    date: "2026-09-25",
    amount: 100_000,
    memo: "Original memo",
    checkNumber: null,
    clearedStatus: "uncleared",
    payeeId: null,
    payeeName: "Employer",
    rawPayeeName: null,
    categoryId: null,
    categoryName: null,
    incomeBudgetMonth: "2026-09",
    inflowClassification: "income",
    transferAccountId: null,
    transferTransactionId: null,
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    importProvenance: [],
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

test("unrelated edits preserve canonical general income metadata atomically", async () => {
  const existing = existingTransaction();

  const updated = await transactionRecord(
    existing.id,
    {
      budgetId: existing.budgetId,
      accountId: existing.accountId,
      date: existing.date,
      amount: existing.amount,
      payeeName: existing.payeeName ?? undefined,
      memo: "Updated memo",
    },
    existing,
  );

  assert.equal(updated.incomeBudgetMonth, "2026-09");
  assert.equal(updated.inflowClassification, "income");
});

test("date edits revalidate inherited canonical income month", async () => {
  const existing = existingTransaction();

  await assert.rejects(
    () => transactionRecord(
      existing.id,
      {
        budgetId: existing.budgetId,
        accountId: existing.accountId,
        date: "2026-10-01",
        amount: existing.amount,
        payeeName: existing.payeeName ?? undefined,
      },
      existing,
    ),
    /transaction month or the following month/,
  );
});

test("changing a classified inflow into an outflow clears inherited metadata", async () => {
  const existing = existingTransaction({
    categoryId: "groceries",
    categoryName: "Groceries",
    incomeBudgetMonth: null,
    inflowClassification: "category-inflow",
  });

  const updated = await transactionRecord(
    existing.id,
    {
      budgetId: existing.budgetId,
      accountId: existing.accountId,
      date: existing.date,
      amount: -5_000,
      categoryId: "groceries",
      categoryName: "Groceries",
    },
    existing,
  );

  assert.equal(updated.incomeBudgetMonth, null);
  assert.equal(updated.inflowClassification, null);
});

test("explicit income metadata on an outflow is rejected", async () => {
  const existing = existingTransaction({
    categoryId: "groceries",
    categoryName: "Groceries",
    incomeBudgetMonth: null,
    inflowClassification: "income",
  });

  await assert.rejects(
    () => transactionRecord(
      existing.id,
      {
        budgetId: existing.budgetId,
        accountId: existing.accountId,
        date: existing.date,
        amount: -5_000,
        categoryId: "groceries",
        categoryName: "Groceries",
        inflowClassification: "income",
      },
      existing,
    ),
    /Outflows and transfers/,
  );
});

test("unrelated edits preserve canonical split income metadata", async () => {
  const existing = existingTransaction({
    amount: 100_000,
    categoryId: null,
    categoryName: "Split",
    incomeBudgetMonth: null,
    inflowClassification: null,
    splitLines: [
      {
        id: "salary",
        categoryId: null,
        categoryName: null,
        incomeBudgetMonth: "2026-09",
        inflowClassification: "income",
        transferAccountId: null,
        transferTransactionId: null,
        memo: "Salary",
        amount: 80_000,
      },
      {
        id: "refund",
        categoryId: "groceries",
        categoryName: "Groceries",
        incomeBudgetMonth: null,
        inflowClassification: "category-inflow",
        transferAccountId: null,
        transferTransactionId: null,
        memo: "Refund",
        amount: 20_000,
      },
    ],
  });

  const updated = await transactionRecord(
    existing.id,
    {
      budgetId: existing.budgetId,
      accountId: existing.accountId,
      date: existing.date,
      amount: existing.amount,
      payeeName: "Updated employer",
      splitLines: [
        {
          id: "salary",
          amount: 80_000,
        },
        {
          id: "refund",
          categoryId: "groceries",
          categoryName: "Groceries",
          amount: 20_000,
        },
      ],
    },
    existing,
  );

  assert.deepEqual(
    updated.splitLines.map((split) => ({
      id: split.id,
      incomeBudgetMonth: split.incomeBudgetMonth,
      inflowClassification: split.inflowClassification,
    })),
    [
      {
        id: "salary",
        incomeBudgetMonth: "2026-09",
        inflowClassification: "income",
      },
      {
        id: "refund",
        incomeBudgetMonth: null,
        inflowClassification: "category-inflow",
      },
    ],
  );
});

test("changing a classified split inflow into an outflow clears inherited metadata", async () => {
  const existing = existingTransaction({
    amount: 5_000,
    categoryId: null,
    categoryName: "Split",
    incomeBudgetMonth: null,
    inflowClassification: null,
    splitLines: [
      {
        id: "refund",
        categoryId: "groceries",
        categoryName: "Groceries",
        incomeBudgetMonth: null,
        inflowClassification: "category-inflow",
        transferAccountId: null,
        transferTransactionId: null,
        memo: null,
        amount: 5_000,
      },
    ],
  });

  const updated = await transactionRecord(
    existing.id,
    {
      budgetId: existing.budgetId,
      accountId: existing.accountId,
      date: existing.date,
      amount: -5_000,
      splitLines: [
        {
          id: "refund",
          categoryId: "groceries",
          categoryName: "Groceries",
          amount: -5_000,
        },
      ],
    },
    existing,
  );

  assert.equal(updated.splitLines[0]?.incomeBudgetMonth, null);
  assert.equal(updated.splitLines[0]?.inflowClassification, null);
});
