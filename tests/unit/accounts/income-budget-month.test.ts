import assert from "node:assert/strict";
import test from "node:test";

import {
  incomeBudgetMonthOptions,
  latestAllowedIncomeBudgetMonth,
  validIncomeBudgetMonth,
} from "../../../apps/web/src/features/accounts/incomeBudgetMonth.js";
import {
  buildNewRegisterTransactionInput,
} from "../../../apps/web/src/features/accounts/registerTransactionDrafts.js";

const categoryOptions = [{
  id: "__ready_to_assign__",
  name: "Ready to Assign",
  groupName: "Income",
  archived: false,
}];

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
    latestIncomeBudgetMonth: "2026-12",
  };
}

test("Income for Month options begin at the transaction month and respect the configured future limit", () => {
  assert.equal(latestAllowedIncomeBudgetMonth("2026-09", 3), "2026-12");
  assert.deepEqual(
    incomeBudgetMonthOptions("2026-11-15", "2026-12").map(({ value }) => value),
    ["2026-11", "2026-12"],
  );
  assert.equal(validIncomeBudgetMonth("2026-10", "2026-09-24", "2026-12"), true);
  assert.equal(validIncomeBudgetMonth("2026-08", "2026-09-24", "2026-12"), false);
  assert.equal(validIncomeBudgetMonth("2027-01", "2026-09-24", "2026-12"), false);
});

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

test("split Ready to Assign inflow stores only explicit future compatibility metadata", () => {
  const splitBase = {
    ...baseDraft(),
    category: "Split",
    inflow: "100.00",
    splitLines: [{
      id: "income-line",
      category: "Ready to Assign",
      categoryId: "__ready_to_assign__",
      memo: "",
      outflow: "",
      inflow: "100.00",
    }],
  };

  const current = buildNewRegisterTransactionInput(splitBase);
  assert.equal(current?.splitLines?.[0]?.incomeBudgetMonth, undefined);

  const future = buildNewRegisterTransactionInput({
    ...splitBase,
    splitLines: [{
      ...splitBase.splitLines[0],
      incomeBudgetMonth: "2026-12",
    }],
  });
  assert.equal(future?.splitLines?.[0]?.incomeBudgetMonth, "2026-12");

  const moved = buildNewRegisterTransactionInput({
    ...splitBase,
    date: "2026-10-02",
    splitLines: [{
      ...splitBase.splitLines[0],
      incomeBudgetMonth: "2026-09",
    }],
  });
  assert.ok(moved);
  assert.equal(moved.splitLines?.[0]?.incomeBudgetMonth, undefined);
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
