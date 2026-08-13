import assert from "node:assert/strict";
import test from "node:test";

import {
  projectBudget,
  type BudgetProjectionInput,
} from "../../../packages/budget-engine/src/projection/projectBudget.js";

function baseInput(
  overrides: Partial<BudgetProjectionInput> = {},
): BudgetProjectionInput {
  return {
    budgetId: "budget-1",
    fromMonth: "2026-01",
    throughMonth: "2026-01",
    accounts: [
      {
        id: "cash",
        participation: "on-budget",
        type: "cash",
      },
      {
        id: "savings",
        participation: "on-budget",
        type: "cash",
      },
      {
        id: "card",
        participation: "on-budget",
        type: "credit-card",
      },
      {
        id: "mortgage",
        participation: "off-budget",
        type: "cash",
      },
    ],
    categories: [
      {
        id: "groceries",
        groupId: "living",
        overspendingPolicy: "reduce-next-month",
      },
      {
        id: "card-payment",
        groupId: "credit-card-payments",
        overspendingPolicy: "reduce-next-month",
      },
    ],
    assignments: [],
    transactions: [],
    ...overrides,
  };
}

function category(
  input: ReturnType<typeof projectBudget>,
  month: string,
  categoryId: string,
) {
  const projection = input.months.find((item) => item.month === month);
  assert.ok(projection, `Expected projection for ${month}`);

  const result = projection.categories.find(
    (item) => item.categoryId === categoryId,
  );
  assert.ok(result, `Expected category ${categoryId} in ${month}`);

  return result;
}

test("projects financial values exactly in integer minor units", () => {
  const result = projectBudget(baseInput({
    openingReadyToAssign: 1_000,
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 303,
      },
    ],
    transactions: [
      {
        id: "income",
        accountId: "cash",
        date: "2026-01-01",
        categoryId: "__ready_to_assign__",
        amount: 202,
      },
    ],
  }));

  const month = result.months[0]!;

  assert.equal(month.income, 202);
  assert.equal(month.assigned, 303);
  assert.equal(month.readyToAssign, 899);
  assert.equal(category(result, "2026-01", "groceries").available, 303);

  assert.throws(
    () => projectBudget(baseInput({
      assignments: [
        {
          month: "2026-01",
          categoryId: "groceries",
          amount: 1.5,
        },
      ],
    })),
    /safe integer minor units/,
  );

  assert.throws(
    () => projectBudget(baseInput({
      transactions: [
        {
          id: "fractional",
          accountId: "cash",
          date: "2026-01-01",
          categoryId: "groceries",
          amount: -10.5,
        },
      ],
    })),
    /safe integer minor units/,
  );
});

test("keeps Ready to Assign internally consistent across months", () => {
  const result = projectBudget(baseInput({
    fromMonth: "2026-01",
    throughMonth: "2026-02",
    openingReadyToAssign: 1_000,
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 400,
      },
    ],
    transactions: [
      {
        id: "income",
        accountId: "cash",
        date: "2026-01-03",
        categoryId: "__ready_to_assign__",
        amount: 2_500,
      },
    ],
  }));

  const january = result.months[0]!;
  const february = result.months[1]!;

  assert.equal(january.carriedForwardReadyToAssign, 1_000);
  assert.equal(january.income, 2_500);
  assert.equal(january.assigned, 400);
  assert.equal(january.previousOverspending, 0);
  assert.equal(january.readyToAssign, 3_100);

  assert.equal(february.carriedForwardReadyToAssign, 3_100);
  assert.equal(february.income, 0);
  assert.equal(february.assigned, 0);
  assert.equal(february.previousOverspending, 0);
  assert.equal(february.readyToAssign, 3_100);
});

test("treats transfers between on-budget accounts as budget-neutral", () => {
  const result = projectBudget(baseInput({
    transactions: [
      {
        id: "transfer",
        accountId: "cash",
        date: "2026-01-05",
        categoryId: "groceries",
        transferAccountId: "savings",
        amount: -1_000,
      },
    ],
  }));

  const month = result.months[0]!;

  assert.equal(month.income, 0);
  assert.equal(month.activity, 0);
  assert.equal(month.readyToAssign, 0);
  assert.equal(category(result, "2026-01", "groceries").activity, 0);
});

test("treats a categorised transfer to an off-budget account as spending", () => {
  const result = projectBudget(baseInput({
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 1_000,
      },
    ],
    transactions: [
      {
        id: "mortgage-payment",
        accountId: "cash",
        date: "2026-01-05",
        categoryId: "groceries",
        transferAccountId: "mortgage",
        amount: -750,
      },
    ],
  }));

  const groceries = category(result, "2026-01", "groceries");

  assert.equal(groceries.activity, -750);
  assert.equal(groceries.available, 250);
});

test("conserves split value and excludes on-budget transfer splits from activity", () => {
  const result = projectBudget(baseInput({
    transactions: [
      {
        id: "split",
        accountId: "cash",
        date: "2026-01-06",
        categoryId: null,
        amount: -1_000,
        splits: [
          {
            id: "split-groceries",
            categoryId: "groceries",
            amount: -600,
          },
          {
            id: "split-transfer",
            categoryId: null,
            transferAccountId: "savings",
            amount: -400,
          },
        ],
      },
    ],
  }));

  assert.equal(
    category(result, "2026-01", "groceries").activity,
    -600,
  );

  assert.throws(
    () => projectBudget(baseInput({
      transactions: [
        {
          id: "invalid-split",
          accountId: "cash",
          date: "2026-01-06",
          categoryId: null,
          amount: -1_000,
          splits: [
            {
              id: "one",
              categoryId: "groceries",
              amount: -600,
            },
            {
              id: "two",
              categoryId: null,
              transferAccountId: "savings",
              amount: -399,
            },
          ],
        },
      ],
    })),
    /does not conserve its parent amount/,
  );
});

test("carries negative Available into the category under carry-category policy", () => {
  const result = projectBudget(baseInput({
    fromMonth: "2026-01",
    throughMonth: "2026-02",
    openingReadyToAssign: 2_000,
    categories: [
      {
        id: "groceries",
        groupId: "living",
        overspendingPolicy: "carry-category",
      },
      {
        id: "card-payment",
        groupId: "credit-card-payments",
        overspendingPolicy: "reduce-next-month",
      },
    ],
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 1_000,
      },
    ],
    transactions: [
      {
        id: "overspend",
        accountId: "cash",
        date: "2026-01-10",
        categoryId: "groceries",
        amount: -1_500,
      },
    ],
  }));

  const january = category(result, "2026-01", "groceries");
  const february = category(result, "2026-02", "groceries");

  assert.equal(january.available, -500);
  assert.equal(february.previousAvailable, -500);
  assert.equal(february.available, -500);
  assert.equal(result.months[1]!.previousOverspending, 0);
  assert.equal(result.months[1]!.readyToAssign, 1_000);
});

test("reduces next month's Ready to Assign for reduce-next-month overspending", () => {
  const result = projectBudget(baseInput({
    fromMonth: "2026-01",
    throughMonth: "2026-02",
    openingReadyToAssign: 2_000,
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 1_000,
      },
    ],
    transactions: [
      {
        id: "overspend",
        accountId: "cash",
        date: "2026-01-10",
        categoryId: "groceries",
        amount: -1_500,
      },
    ],
  }));

  const january = category(result, "2026-01", "groceries");
  const february = category(result, "2026-02", "groceries");

  assert.equal(january.available, -500);
  assert.equal(february.previousAvailable, 0);
  assert.equal(february.available, 0);
  assert.equal(result.months[1]!.previousOverspending, -500);
  assert.equal(result.months[1]!.readyToAssign, 500);
});

test("uses the closing month's overspending policy for the following rollover", () => {
  const result = projectBudget(baseInput({
    fromMonth: "2026-01",
    throughMonth: "2026-03",
    openingReadyToAssign: 2_000,
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 1_000,
      },
    ],
    overspendingPolicies: [
      {
        month: "2026-02",
        categoryId: "groceries",
        policy: "carry-category",
      },
    ],
    transactions: [
      {
        id: "january-overspend",
        accountId: "cash",
        date: "2026-01-10",
        categoryId: "groceries",
        amount: -1_500,
      },
      {
        id: "february-overspend",
        accountId: "cash",
        date: "2026-02-10",
        categoryId: "groceries",
        amount: -200,
      },
    ],
  }));

  const february = category(result, "2026-02", "groceries");
  const march = category(result, "2026-03", "groceries");

  assert.equal(result.months[1]!.previousOverspending, -500);
  assert.equal(february.previousAvailable, 0);
  assert.equal(february.available, -200);
  assert.equal(february.overspendingPolicy, "carry-category");

  assert.equal(result.months[2]!.previousOverspending, 0);
  assert.equal(march.previousAvailable, -200);
  assert.equal(march.available, -200);
});

test("keeps manual credit-card spending separate from payment funding", () => {
  const result = projectBudget(baseInput({
    openingReadyToAssign: 1_000,
    creditCardPolicy: "manual",
    paymentCategoryIdByAccountId: {
      card: "card-payment",
    },
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 1_000,
      },
    ],
    transactions: [
      {
        id: "card-purchase",
        accountId: "card",
        date: "2026-01-12",
        categoryId: "groceries",
        amount: -600,
      },
    ],
  }));

  assert.equal(
    category(result, "2026-01", "groceries").available,
    400,
  );
  assert.equal(
    category(result, "2026-01", "card-payment").activity,
    0,
  );
  assert.equal(
    category(result, "2026-01", "card-payment").available,
    0,
  );
});

test("funds only budget-backed credit-card spending under payment-funding policy", () => {
  const result = projectBudget(baseInput({
    openingReadyToAssign: 300,
    creditCardPolicy: "payment-funding",
    paymentCategoryIdByAccountId: {
      card: "card-payment",
    },
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 300,
      },
    ],
    transactions: [
      {
        id: "card-purchase",
        accountId: "card",
        date: "2026-01-12",
        categoryId: "groceries",
        amount: -600,
      },
    ],
  }));

  assert.equal(
    category(result, "2026-01", "groceries").activity,
    -600,
  );
  assert.equal(
    category(result, "2026-01", "groceries").available,
    -300,
  );
  assert.equal(
    category(result, "2026-01", "card-payment").activity,
    300,
  );
  assert.equal(
    category(result, "2026-01", "card-payment").available,
    300,
  );
});

test("reduces funded credit-card payment Available when the card is paid", () => {
  const result = projectBudget(baseInput({
    openingReadyToAssign: 1_000,
    creditCardPolicy: "payment-funding",
    paymentCategoryIdByAccountId: {
      card: "card-payment",
    },
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 1_000,
      },
    ],
    transactions: [
      {
        id: "card-purchase",
        accountId: "card",
        date: "2026-01-05",
        categoryId: "groceries",
        amount: -600,
      },
      {
        id: "card-payment",
        accountId: "cash",
        date: "2026-01-20",
        categoryId: null,
        transferAccountId: "card",
        amount: -400,
      },
    ],
  }));

  const payment = category(result, "2026-01", "card-payment");

  assert.equal(payment.activity, 200);
  assert.equal(payment.available, 200);
});

test("reverses credit-card payment funding for a refund", () => {
  const result = projectBudget(baseInput({
    creditCardPolicy: "payment-funding",
    paymentCategoryIdByAccountId: {
      card: "card-payment",
    },
    openingAvailableByCategoryId: {
      groceries: 400,
      "card-payment": 400,
    },
    transactions: [
      {
        id: "refund",
        accountId: "card",
        date: "2026-01-15",
        categoryId: "groceries",
        amount: 200,
      },
    ],
  }));

  assert.equal(
    category(result, "2026-01", "groceries").available,
    600,
  );
  assert.equal(
    category(result, "2026-01", "card-payment").activity,
    -200,
  );
  assert.equal(
    category(result, "2026-01", "card-payment").available,
    200,
  );
});

test("a credit-card refund after the funded balance was already paid does not create a negative payment reserve", () => {
  const result = projectBudget(baseInput({
    openingReadyToAssign: 1_000,
    creditCardPolicy: "payment-funding",
    paymentCategoryIdByAccountId: {
      card: "card-payment",
    },
    assignments: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: 400,
      },
    ],
    transactions: [
      {
        id: "card-purchase",
        accountId: "card",
        date: "2026-01-05",
        categoryId: "groceries",
        amount: -400,
      },
      {
        id: "card-payment",
        accountId: "cash",
        date: "2026-01-10",
        categoryId: null,
        transferAccountId: "card",
        amount: -400,
      },
      {
        id: "card-refund",
        accountId: "card",
        date: "2026-01-15",
        categoryId: "groceries",
        amount: 200,
      },
    ],
  }));

  assert.equal(
    category(result, "2026-01", "groceries").available,
    200,
    "the refund restores money to the spending category",
  );

  assert.equal(
    category(result, "2026-01", "card-payment").available,
    0,
    "a refund cannot reverse payment funding that has already been consumed by an earlier card payment",
  );
});
