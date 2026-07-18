import assert from "node:assert/strict";
import { buildRegisterTransactionsFromImport } from "../apps/web/src/features/accounts/transactionImportCommit";
import type { TransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImport";

const candidate = {
  id: "candidate-1",
  selected: true,
  status: "new",
  parsed: {
    rowNumber: 1,
    date: "2026-07-16",
    payee: "Example Merchant",
    memo: "",
    outflow: 12.34,
    inflow: 0,
  },
  lifecycle: {
    source: {
      rowNumber: 1,
      date: "2026-07-16",
      rawPayee: "Example Merchant",
      memo: "",
      outflow: 12.34,
      inflow: 0,
    },
    merchant: {
      canonicalPayee: "Example Merchant",
      suggestedCategoryName: "Deleted Category",
      transferAccountName: null,
    },
    proposal: {
      payee: "Example Merchant",
      categoryName: "Deleted Category",
      transferAccountName: null,
    },
  },
} as TransactionImportCandidate;

const transactions = buildRegisterTransactionsFromImport([candidate], {
  categories: [{ id: "cat-groceries", name: "Groceries" }],
});

assert.equal(transactions.length, 1);
assert.equal(transactions[0].category, "Uncategorised");
assert.equal(transactions[0].categoryId, undefined);
assert.equal(transactions[0].payee, "Example Merchant");
console.log("v3.23.5 unavailable import category tests passed");
