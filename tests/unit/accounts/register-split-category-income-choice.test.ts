import assert from "node:assert/strict";
import test from "node:test";

import {
  applySplitCategoryChoice,
  applySplitDraftSign,
  createSplitLineDraft,
  splitDraftsFromTransaction,
} from "../../../apps/web/src/features/accounts/registerSplitDrafts.js";

const categoryOptions = [
  {
    id: "__ready_to_assign__",
    name: "Ready to Assign",
    groupName: "Income",
    archived: false,
  },
  {
    id: "groceries",
    name: "Groceries",
    groupName: "Everyday",
    archived: false,
  },
];

test("split category selection maps current-month synthetic income explicitly", () => {
  const line = applySplitCategoryChoice(
    createSplitLineDraft(),
    "Income for September 2026",
    categoryOptions,
    "2026-09-26",
  );

  assert.equal(line.category, "Income for September 2026");
  assert.equal(line.categoryId, undefined);
  assert.equal(line.incomeBudgetMonth, "2026-09");
  assert.equal(line.inflowClassification, "income");
});

test("split category selection maps following-month synthetic income explicitly", () => {
  const line = applySplitCategoryChoice(
    createSplitLineDraft(),
    "Income for October 2026",
    categoryOptions,
    "2026-09-26",
  );

  assert.equal(line.categoryId, undefined);
  assert.equal(line.incomeBudgetMonth, "2026-10");
  assert.equal(line.inflowClassification, "income");
});

test("switching a split from synthetic income to an ordinary category clears income metadata", () => {
  const incomeLine = applySplitCategoryChoice(
    createSplitLineDraft(),
    "Income for September 2026",
    categoryOptions,
    "2026-09-26",
  );
  const ordinaryLine = applySplitCategoryChoice(
    incomeLine,
    "Groceries",
    categoryOptions,
    "2026-09-26",
  );

  assert.equal(ordinaryLine.category, "Groceries");
  assert.equal(ordinaryLine.categoryId, "groceries");
  assert.equal(ordinaryLine.incomeBudgetMonth, undefined);
  assert.equal(ordinaryLine.inflowClassification, undefined);
});


test("legacy Ready to Assign split readback hydrates to explicit Income for Month", () => {
  const [line] = splitDraftsFromTransaction({
    id: "transaction-1",
    date: "2026-09-26",
    attachmentCount: 0,
    payee: "Employer",
    category: "Split...",
    memo: "",
    checkNumber: "",
    inflow: 100,
    outflow: 0,
    runningBalance: 100,
    cleared: false,
    reconciled: false,
    splitLines: [{
      id: "legacy-income",
      category: "Ready to Assign",
      categoryId: "__ready_to_assign__",
      incomeBudgetMonth: "2026-09",
      memo: "",
      inflow: 100,
      outflow: 0,
    }],
  });

  assert.equal(line?.category, "Income for September 2026");
  assert.equal(line?.categoryId, undefined);
  assert.equal(line?.incomeBudgetMonth, "2026-09");
  assert.equal(line?.inflowClassification, "income");
});


test("changing synthetic split income to outflow clears synthetic income state", () => {
  const incomeLine = {
    ...applySplitCategoryChoice(
      createSplitLineDraft(),
      "Income for September 2026",
      categoryOptions,
      "2026-09-26",
    ),
    inflow: "100.00",
  };

  const outflowLine = applySplitDraftSign(incomeLine, "outflow");

  assert.equal(outflowLine.category, "");
  assert.equal(outflowLine.outflow, "100.00");
  assert.equal(outflowLine.inflow, "");
  assert.equal(outflowLine.incomeBudgetMonth, undefined);
  assert.equal(outflowLine.inflowClassification, undefined);
  assert.equal(outflowLine.countCategoryInflowAsIncome, false);
});

test("changing ordinary category inflow to outflow preserves category but clears income classification", () => {
  const ordinaryLine = {
    ...applySplitCategoryChoice(
      createSplitLineDraft(),
      "Groceries",
      categoryOptions,
      "2026-09-26",
    ),
    inflow: "20.00",
    inflowClassification: "income" as const,
    countCategoryInflowAsIncome: true,
  };

  const outflowLine = applySplitDraftSign(ordinaryLine, "outflow");

  assert.equal(outflowLine.category, "Groceries");
  assert.equal(outflowLine.categoryId, "groceries");
  assert.equal(outflowLine.outflow, "20.00");
  assert.equal(outflowLine.inflow, "");
  assert.equal(outflowLine.inflowClassification, undefined);
  assert.equal(outflowLine.countCategoryInflowAsIncome, false);
});
