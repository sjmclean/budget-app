import assert from "node:assert/strict";
import test from "node:test";

import { buildRegisterTransactionsFromImport } from "../../../apps/web/src/features/accounts/transactionImportCommit";
import type { TransactionImportCandidate } from "../../../apps/web/src/features/accounts/transactionImport";

function candidate(
  categoryName: string | null,
  splitLines?: TransactionImportCandidate["lifecycle"]["proposal"]["splitLines"],
): TransactionImportCandidate {
  return {
    id: "row-1",
    parsed: {
      rowNumber: 1,
      date: "2026-09-26",
      payee: "Deposit",
      outflow: 0,
      inflow: 100,
      raw: {},
    },
    status: "new",
    reason: "new",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date: "2026-09-26",
        rawPayee: "BANK DEPOSIT",
        outflow: 0,
        inflow: 100,
      },
      merchant: {
        canonicalPayee: "Deposit",
        suggestedCategoryName: categoryName,
        transferAccountName: null,
      },
      proposal: {
        payee: "Deposit",
        categoryName,
        transferAccountName: null,
        splitLines,
      },
    },
  } as TransactionImportCandidate;
}

test("positive uncategorised bank inflow remains uncategorised and is not income", () => {
  const [transaction] = buildRegisterTransactionsFromImport(
    [candidate(null)],
    {
      identityScope: "statement.csv:hash",
      categories: [{ id: "groceries", name: "Groceries" }],
    },
  );

  assert.equal(transaction?.category, "Uncategorised");
  assert.equal(transaction?.categoryId, undefined);
  assert.equal(transaction?.incomeBudgetMonth, undefined);
  assert.equal(transaction?.inflowClassification, undefined);
});

test("positive bank inflow assigned to a real category defaults to category-inflow", () => {
  const [transaction] = buildRegisterTransactionsFromImport(
    [candidate("Groceries")],
    {
      identityScope: "statement.csv:hash",
      categories: [{ id: "groceries", name: "Groceries" }],
    },
  );

  assert.equal(transaction?.category, "Groceries");
  assert.equal(transaction?.categoryId, "groceries");
  assert.equal(transaction?.incomeBudgetMonth, undefined);
  assert.equal(transaction?.inflowClassification, "category-inflow");
});

test("positive ordinary bank-import split lines default to category-inflow", () => {
  const [transaction] = buildRegisterTransactionsFromImport(
    [candidate(null, [
      {
        id: "split-1",
        category: "Groceries",
        categoryId: "groceries",
        memo: "",
        outflow: 0,
        inflow: 100,
      },
    ])],
    {
      identityScope: "statement.csv:hash",
      categories: [{ id: "groceries", name: "Groceries" }],
    },
  );

  assert.equal(transaction?.category, "Split");
  assert.equal(transaction?.splitLines?.[0]?.categoryId, "groceries");
  assert.equal(transaction?.splitLines?.[0]?.incomeBudgetMonth, undefined);
  assert.equal(
    transaction?.splitLines?.[0]?.inflowClassification,
    "category-inflow",
  );
});
