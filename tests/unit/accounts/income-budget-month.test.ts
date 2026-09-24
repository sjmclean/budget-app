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

test("ordinary Ready to Assign inflow defaults to its transaction month and accepts a valid future month", () => {
  const current = buildNewRegisterTransactionInput(baseDraft());
  assert.equal(current?.categoryId, "__ready_to_assign__");
  assert.equal(current?.incomeBudgetMonth, "2026-09");

  const future = buildNewRegisterTransactionInput({
    ...baseDraft(),
    incomeBudgetMonth: "2026-11",
  });
  assert.equal(future?.incomeBudgetMonth, "2026-11");
});

test("ordinary Ready to Assign inflow rejects backdated and out-of-range budget months", () => {
  assert.equal(
    buildNewRegisterTransactionInput({
      ...baseDraft(),
      incomeBudgetMonth: "2026-08",
    }),
    null,
  );
  assert.equal(
    buildNewRegisterTransactionInput({
      ...baseDraft(),
      incomeBudgetMonth: "2027-01",
    }),
    null,
  );
});

test("split Ready to Assign inflow defaults and validates Income for Month line by line", () => {
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
  assert.equal(current?.splitLines?.[0]?.incomeBudgetMonth, "2026-09");

  const future = buildNewRegisterTransactionInput({
    ...splitBase,
    splitLines: [{
      ...splitBase.splitLines[0],
      incomeBudgetMonth: "2026-12",
    }],
  });
  assert.equal(future?.splitLines?.[0]?.incomeBudgetMonth, "2026-12");

  const invalid = buildNewRegisterTransactionInput({
    ...splitBase,
    splitLines: [{
      ...splitBase.splitLines[0],
      incomeBudgetMonth: "2027-01",
    }],
  });
  assert.equal(invalid, null);
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
