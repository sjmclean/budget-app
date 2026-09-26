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
        id: "groceries",
        name: "Groceries",
        groupName: "Everyday",
      },
    ],
  };
}

test("blank positive inflow remains uncategorised", () => {
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


function splitDraft(
  category: string,
  options: {
    readonly countCategoryInflowAsIncome?: boolean;
    readonly categoryId?: string;
    readonly incomeBudgetMonth?: string;
  } = {},
) {
  return {
    ...draft("Split"),
    splitLines: [{
      id: "split-1",
      category,
      categoryId: options.categoryId,
      incomeBudgetMonth: options.incomeBudgetMonth,
      countCategoryInflowAsIncome: options.countCategoryInflowAsIncome,
      memo: "",
      outflow: "",
      inflow: "100.00",
    }],
  };
}

test("synthetic current-month split income maps to canonical general income", () => {
  const input = buildNewRegisterTransactionInput(
    splitDraft("Income for September 2026"),
  );
  assert.ok(input?.splitLines);
  assert.equal(input.splitLines[0]?.categoryId, undefined);
  assert.equal(input.splitLines[0]?.incomeBudgetMonth, "2026-09");
  assert.equal(input.splitLines[0]?.inflowClassification, "income");
});

test("synthetic following-month split income maps to canonical general income", () => {
  const input = buildNewRegisterTransactionInput(
    splitDraft("Income for October 2026"),
  );
  assert.ok(input?.splitLines);
  assert.equal(input.splitLines[0]?.categoryId, undefined);
  assert.equal(input.splitLines[0]?.incomeBudgetMonth, "2026-10");
  assert.equal(input.splitLines[0]?.inflowClassification, "income");
});

test("synthetic split income rejects an arbitrary later month", () => {
  assert.equal(
    buildNewRegisterTransactionInput(
      splitDraft("Income for November 2026"),
    ),
    null,
  );
});

test("ordinary positive category split defaults to category-inflow", () => {
  const input = buildNewRegisterTransactionInput(
    splitDraft("Groceries", { categoryId: "groceries" }),
  );
  assert.ok(input?.splitLines);
  assert.equal(input.splitLines[0]?.categoryId, "groceries");
  assert.equal(input.splitLines[0]?.incomeBudgetMonth, undefined);
  assert.equal(input.splitLines[0]?.inflowClassification, "category-inflow");
});

test("ordinary positive category split can explicitly count as income", () => {
  const input = buildNewRegisterTransactionInput(
    splitDraft("Groceries", {
      categoryId: "groceries",
      countCategoryInflowAsIncome: true,
    }),
  );
  assert.ok(input?.splitLines);
  assert.equal(input.splitLines[0]?.categoryId, "groceries");
  assert.equal(input.splitLines[0]?.incomeBudgetMonth, undefined);
  assert.equal(input.splitLines[0]?.inflowClassification, "income");
});



test("changing synthetic income to a transfer cannot retain income semantics", () => {
  const input = buildNewRegisterTransactionInput({
    ...draft("Income for September 2026"),
    transferAccountId: "savings",
  });

  assert.equal(input, null);
});

test("changing synthetic income to an outflow rejects the stale synthetic category", () => {
  const input = buildNewRegisterTransactionInput({
    ...draft("Income for September 2026", ""),
    outflow: "100.00",
  });

  assert.equal(input, null);
});

test("changing synthetic income to an ordinary category clears income month semantics", () => {
  const input = buildNewRegisterTransactionInput(draft("Groceries"));
  assert.ok(input);
  assert.equal(input.categoryId, "groceries");
  assert.equal(input.incomeBudgetMonth, undefined);
  assert.equal(input.inflowClassification, "category-inflow");
});

test("changing transaction date rejects a stale synthetic income month", () => {
  const input = buildNewRegisterTransactionInput({
    ...draft("Income for September 2026"),
    date: "2026-10-01",
  });

  assert.equal(input, null);
});






