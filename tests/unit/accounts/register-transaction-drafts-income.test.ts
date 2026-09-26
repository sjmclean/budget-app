import assert from "node:assert/strict";
import test from "node:test";
import { buildNewRegisterTransactionInput } from "../../../apps/web/src/features/accounts/registerTransactionDrafts";

function draft(
  category: string,
  inflow = "100.00",
  countCategoryInflowAsIncome = false,
) {
  return {
    date: "2026-09-26",
    payee: "Employer",
    category,
    memo: "",
    checkNumber: "",
    outflow: "",
    inflow,
    countCategoryInflowAsIncome,
    splitLines: [],
    categoryOptions: [
      {
        id: "__ready_to_assign__",
        name: "Ready to Assign",
        groupName: "Internal",
      },
      {
        id: "groceries",
        name: "Groceries",
        groupName: "Everyday",
      },
    ],
  };
}

test("blank positive inflow remains uncategorised instead of becoming Ready to Assign", () => {
  const input = buildNewRegisterTransactionInput(draft(""));
  assert.ok(input);
  assert.equal(input.category, "Uncategorised");
  assert.equal(input.categoryId, undefined);
  assert.equal(input.incomeBudgetMonth, undefined);
  assert.equal(input.inflowClassification, undefined);
});

test("synthetic current-month income maps to canonical general income", () => {
  const input = buildNewRegisterTransactionInput(
    draft("Income for September 2026"),
  );
  assert.ok(input);
  assert.equal(input.categoryId, undefined);
  assert.equal(input.incomeBudgetMonth, "2026-09");
  assert.equal(input.inflowClassification, "income");
});

test("synthetic following-month income maps to canonical general income", () => {
  const input = buildNewRegisterTransactionInput(
    draft("Income for October 2026"),
  );
  assert.ok(input);
  assert.equal(input.categoryId, undefined);
  assert.equal(input.incomeBudgetMonth, "2026-10");
  assert.equal(input.inflowClassification, "income");
});

test("synthetic income cannot target an arbitrary later month", () => {
  assert.equal(
    buildNewRegisterTransactionInput(draft("Income for November 2026")),
    null,
  );
});


test("ordinary positive category inflow defaults to category-inflow", () => {
  const input = buildNewRegisterTransactionInput(draft("Groceries"));
  assert.ok(input);
  assert.equal(input.categoryId, "groceries");
  assert.equal(input.incomeBudgetMonth, undefined);
  assert.equal(input.inflowClassification, "category-inflow");
});

test("ordinary positive category inflow can explicitly count as income", () => {
  const input = buildNewRegisterTransactionInput(draft("Groceries", "100.00", true));
  assert.ok(input);
  assert.equal(input.categoryId, "groceries");
  assert.equal(input.incomeBudgetMonth, undefined);
  assert.equal(input.inflowClassification, "income");
});

test("uncategorised positive inflow never gains a direct-category classification", () => {
  const input = buildNewRegisterTransactionInput(draft("", "100.00", true));
  assert.ok(input);
  assert.equal(input.categoryId, undefined);
  assert.equal(input.inflowClassification, undefined);
});

test("transfer inflow never gains an income classification", () => {
  const input = buildNewRegisterTransactionInput({
    ...draft("Groceries", "100.00", true),
    transferAccountId: "savings",
  });
  assert.ok(input);
  assert.equal(input.inflowClassification, undefined);
});
