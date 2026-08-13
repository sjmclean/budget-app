import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegisterTransactionsFromImport,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";

test("bank import preserves a reviewed spending category on an inflow refund", () => {
  const candidate: TransactionImportCandidate = {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-01",
      payee: "Supermarket",
      inflow: 25,
      outflow: 0,
      raw: {},
    },
    status: "new",
    reason: "new transaction",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-01",
        rawPayee: "Supermarket",
        inflow: 25,
        outflow: 0,
      },
      merchant: {
        canonicalPayee: "Supermarket",
        suggestedCategoryName: "Groceries",
        transferAccountName: null,
      },
      proposal: {
        payee: "Supermarket",
        categoryName: "Groceries",
        transferAccountName: null,
      },
    },
  };

  const [transaction] = buildRegisterTransactionsFromImport(
    [candidate],
    {
      categories: [{ id: "groceries", name: "Groceries" }],
      identityScope: "sha256:refund-category-fixture",
    },
  );

  assert.ok(transaction);
  assert.equal(transaction.inflow, 25);
  assert.equal(transaction.outflow, 0);

  assert.equal(
    transaction.category,
    "Groceries",
    "a reviewed refund category must not be silently replaced with Ready to Assign",
  );
  assert.equal(transaction.categoryId, "groceries");
});

test("bank import keeps uncategorised positive income as Ready to Assign", () => {
  const candidate: TransactionImportCandidate = {
    id: "row-3",
    parsed: {
      rowNumber: 3,
      date: "2026-08-02",
      payee: "Employer",
      inflow: 1000,
      outflow: 0,
      raw: {},
    },
    status: "new",
    reason: "new transaction",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 3,
        date: "2026-08-02",
        rawPayee: "Employer",
        inflow: 1000,
        outflow: 0,
      },
      merchant: {
        canonicalPayee: "Employer",
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: "Employer",
        categoryName: null,
        transferAccountName: null,
      },
    },
  };

  const [transaction] = buildRegisterTransactionsFromImport([candidate], {
    categories: [{ id: "groceries", name: "Groceries" }],
    identityScope: "sha256:income-fixture",
  });

  assert.ok(transaction);
  assert.equal(transaction.inflow, 1000);
  assert.equal(transaction.outflow, 0);
  assert.equal(transaction.category, "Ready to Assign");
  assert.equal(transaction.categoryId, "__ready_to_assign__");
});
