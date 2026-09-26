import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewRegisterTransactionInput,
} from "../../../apps/web/src/features/accounts/registerTransactionDrafts.js";

const categoryOptions = [];

function baseDraft() {
  return {
    date: "2026-09-24",
    payee: "Employer",
    category: "",
    memo: "",
    checkNumber: "",
    outflow: "",
    inflow: "100.00",
    splitLines: [],
    categoryOptions,
  };
}

test("parent inflow requires an explicit synthetic income choice", () => {
  const uncategorised = buildNewRegisterTransactionInput(baseDraft());
  assert.ok(uncategorised);
  assert.equal(uncategorised.category, "Uncategorised");
  assert.equal(uncategorised.categoryId, undefined);
  assert.equal(uncategorised.incomeBudgetMonth, undefined);
  assert.equal(uncategorised.inflowClassification, undefined);

  const current = buildNewRegisterTransactionInput({
    ...baseDraft(),
    category: "Income for September 2026",
  });
  assert.equal(current?.categoryId, undefined);
  assert.equal(current?.incomeBudgetMonth, "2026-09");
  assert.equal(current?.inflowClassification, "income");

  const following = buildNewRegisterTransactionInput({
    ...baseDraft(),
    category: "Income for October 2026",
  });
  assert.equal(following?.incomeBudgetMonth, "2026-10");
  assert.equal(following?.inflowClassification, "income");
});

test("parent income rejects a stale or arbitrary synthetic month after the date changes", () => {
  assert.equal(
    buildNewRegisterTransactionInput({
      ...baseDraft(),
      date: "2026-10-02",
      category: "Income for September 2026",
    }),
    null,
  );
  assert.equal(
    buildNewRegisterTransactionInput({
      ...baseDraft(),
      category: "Income for November 2026",
    }),
    null,
  );
});



test("non-income split lines cannot retain a stale income budget month", () => {
  const result = buildNewRegisterTransactionInput({
    ...baseDraft(),
    category: "Split",
    outflow: "100.00",
    inflow: "",
    splitLines: [{
      id: "expense-line",
      category: "Groceries",
      categoryId: "groceries",
      incomeBudgetMonth: "2026-12",
      memo: "",
      outflow: "100.00",
      inflow: "",
    }],
    categoryOptions: [
      ...categoryOptions,
      {
        id: "groceries",
        name: "Groceries",
        groupName: "Everyday",
        archived: false,
      },
    ],
  });

  assert.ok(result);
  assert.equal(result.splitLines?.[0]?.incomeBudgetMonth, undefined);
});
