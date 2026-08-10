import assert from "node:assert/strict";

import {
  createBudgetMonth,
  createCategoryMonth,
  projectBudget,
  rolloverBudgetMonth,
  type BudgetProjectionInput,
} from "../packages/budget-engine/src/index.ts";

const accounts = [
  { id: "checking", participation: "on-budget" as const, type: "cash" as const },
  { id: "savings", participation: "on-budget" as const },
  { id: "tracking", participation: "off-budget" as const },
  { id: "visa", participation: "on-budget" as const, type: "credit-card" as const },
];
const categories = [
  { id: "carry", groupId: "living", overspendingPolicy: "carry-category" as const },
  { id: "reduce", groupId: "living", overspendingPolicy: "reduce-next-month" as const },
  { id: "positive", groupId: "savings", overspendingPolicy: "reduce-next-month" as const },
  { id: "visa-payment", groupId: "credit-card-payments", overspendingPolicy: "reduce-next-month" as const },
];

const rollover = projectBudget({
  budgetId: "budget",
  fromMonth: "2026-07",
  throughMonth: "2026-08",
  readyToAssignCategoryId: "income",
  accounts,
  categories,
  assignments: categories
    .filter((category) => category.id !== "visa-payment")
    .map((category) => ({
    month: "2026-07",
    categoryId: category.id,
    amount: 5_000,
  })),
  transactions: [
    { id: "income", accountId: "checking", date: "2026-07-01", categoryId: "income", amount: 20_000 },
    { id: "carry-spend", accountId: "checking", date: "2026-07-02", categoryId: "carry", amount: -10_000 },
    { id: "reduce-spend", accountId: "checking", date: "2026-07-02", categoryId: "reduce", amount: -10_000 },
    { id: "positive-spend", accountId: "checking", date: "2026-07-02", categoryId: "positive", amount: -2_500 },
  ],
});

assert.equal(rollover.months[0]?.readyToAssign, 5_000);
assert.equal(rollover.months[1]?.previousOverspending, -5_000);
assert.equal(rollover.months[1]?.readyToAssign, 0);
assert.deepEqual(
  Object.fromEntries(rollover.months[1]!.categories.map((category) => [category.categoryId, category.previousAvailable])),
  { carry: -5_000, reduce: 0, positive: 2_500, "visa-payment": 0 },
);
assert.deepEqual(rollover.months[0]?.groups, [
  { groupId: "living", assigned: 10_000, activity: -20_000, available: -10_000 },
  { groupId: "savings", assigned: 5_000, activity: -2_500, available: 2_500 },
  { groupId: "credit-card-payments", assigned: 0, activity: 0, available: 0 },
]);

const splitRules = projectBudget({
  budgetId: "budget",
  fromMonth: "2026-07",
  throughMonth: "2026-07",
  accounts,
  categories,
  assignments: [],
  transactions: [
    {
      id: "split",
      accountId: "checking",
      date: "2026-07-03",
      categoryId: "carry",
      amount: -10_000,
      splits: [
        { id: "a", categoryId: "carry", amount: -6_000 },
        { id: "b", categoryId: "reduce", amount: -3_000 },
        { id: "c", categoryId: null, transferAccountId: "savings", amount: -1_000 },
      ],
    },
    { id: "transfer", accountId: "checking", date: "2026-07-04", categoryId: "carry", transferAccountId: "savings", amount: -500 },
    { id: "tracking", accountId: "tracking", date: "2026-07-04", categoryId: "carry", amount: -500 },
  ],
});
assert.deepEqual(
  Object.fromEntries(splitRules.months[0]!.categories.map((category) => [category.categoryId, category.activity])),
  { carry: -6_000, reduce: -3_000, positive: 0, "visa-payment": 0 },
);

const categorisedOffBudgetTransfer = projectBudget({
  budgetId: "budget",
  fromMonth: "2026-08",
  throughMonth: "2026-08",
  accounts,
  categories,
  openingAvailableByCategoryId: { positive: 180_000 },
  assignments: [],
  transactions: [
    { id: "mortgage-out", accountId: "checking", date: "2026-08-05", categoryId: "positive", transferAccountId: "tracking", amount: -180_000 },
    { id: "mortgage-in", accountId: "tracking", date: "2026-08-05", categoryId: null, transferAccountId: "checking", amount: 180_000 },
  ],
}).months[0]!;
assert.equal(
  categorisedOffBudgetTransfer.categories.find(({ categoryId }) => categoryId === "positive")?.activity,
  -180_000,
);
assert.equal(
  categorisedOffBudgetTransfer.categories.find(({ categoryId }) => categoryId === "positive")?.available,
  0,
);

const creditCardInput: BudgetProjectionInput = {
  budgetId: "budget",
  fromMonth: "2026-07",
  throughMonth: "2026-07",
  accounts,
  categories,
  assignments: [{ month: "2026-07", categoryId: "positive", amount: 5_000 }],
  transactions: [
    { id: "purchase-funded", accountId: "visa", date: "2026-07-01", categoryId: "positive", amount: -4_000 },
    { id: "purchase-partly-funded", accountId: "visa", date: "2026-07-02", categoryId: "positive", amount: -2_000 },
    { id: "refund", accountId: "visa", date: "2026-07-03", categoryId: "positive", amount: 500 },
    { id: "payment", accountId: "checking", date: "2026-07-04", categoryId: null, transferAccountId: "visa", amount: -3_000 },
  ],
};
const manualCreditCard = projectBudget(creditCardInput).months[0]!;
assert.equal(manualCreditCard.categories.find(({ categoryId }) => categoryId === "positive")?.activity, -5_500);
assert.equal(manualCreditCard.categories.find(({ categoryId }) => categoryId === "visa-payment")?.activity, 0);
const paymentFunding = projectBudget({
  ...creditCardInput,
  creditCardPolicy: "payment-funding",
  paymentCategoryIdByAccountId: { visa: "visa-payment" },
}).months[0]!;
assert.equal(paymentFunding.categories.find(({ categoryId }) => categoryId === "positive")?.activity, -5_500);
assert.equal(paymentFunding.categories.find(({ categoryId }) => categoryId === "visa-payment")?.activity, 1_500);

function projectionWithSpend(amount: number) {
  return projectBudget({
    budgetId: "budget",
    fromMonth: "2026-07",
    throughMonth: "2026-07",
    openingAvailableByCategoryId: { positive: 5_000 },
    accounts,
    categories,
    assignments: [],
    transactions: [
      { id: "internet", accountId: "checking", date: "2026-07-05", categoryId: "positive", amount },
    ],
  });
}
assert.equal(projectionWithSpend(-5_200).months[0]!.categories[2]!.available, -200);
assert.equal(projectionWithSpend(-5_436).months[0]!.categories[2]!.available, -436);
assert.deepEqual(projectionWithSpend(-5_436), projectionWithSpend(-5_436));

// Replay an edit from the beginning of a long budget timeline. Cash
// overspending reduces the next month's RTA; category carry remains on the
// category and stays visible in every subsequent month.
const timelineBase = {
  budgetId: "timeline",
  fromMonth: "2020-01",
  throughMonth: "2026-08",
  accounts,
  categories: [{ id: "internet", groupId: "bills", overspendingPolicy: "reduce-next-month" as const }],
  assignments: [],
  transactions: [
    { id: "historical-spend", accountId: "checking", date: "2020-01-15", categoryId: "internet", amount: -100 },
  ],
};
const reducedTimeline = projectBudget(timelineBase);
assert.equal(reducedTimeline.months[1]?.previousOverspending, -100);
assert.equal(reducedTimeline.months[1]?.categories[0]?.previousAvailable, 0);
assert.equal(reducedTimeline.months.at(-1)?.readyToAssign, -100);

const carriedTimeline = projectBudget({
  ...timelineBase,
  overspendingPolicies: [
    { month: "2020-01", categoryId: "internet", policy: "carry-category" },
  ],
});
assert.equal(carriedTimeline.months[1]?.previousOverspending, 0);
assert.equal(carriedTimeline.months[1]?.categories[0]?.previousAvailable, -100);
assert.equal(carriedTimeline.months.at(-1)?.categories[0]?.available, -100);
assert.equal(carriedTimeline.months.at(-1)?.categories[0]?.overspendingPolicy, "carry-category");

const policyTransition = projectBudget({
  budgetId: "policy-transition",
  fromMonth: "2026-07",
  throughMonth: "2026-09",
  accounts,
  categories: [{ id: "internet", groupId: "bills", overspendingPolicy: "carry-category" }],
  assignments: [],
  overspendingPolicies: [
    { month: "2026-08", categoryId: "internet", policy: "reduce-next-month" },
  ],
  transactions: [
    { id: "july-spend", accountId: "checking", date: "2026-07-31", categoryId: "internet", amount: -100 },
  ],
});
assert.equal(policyTransition.months[1]?.categories[0]?.previousAvailable, -100);
assert.equal(policyTransition.months[1]?.previousOverspending, 0);
assert.equal(policyTransition.months[1]?.categories[0]?.overspendingPolicy, "reduce-next-month");
assert.equal(policyTransition.months[2]?.categories[0]?.previousAvailable, 0);
assert.equal(policyTransition.months[2]?.previousOverspending, -100);

const reversePolicyTransition = projectBudget({
  budgetId: "reverse-policy-transition",
  fromMonth: "2026-07",
  throughMonth: "2026-09",
  accounts,
  categories: [{ id: "internet", groupId: "bills", overspendingPolicy: "reduce-next-month" }],
  assignments: [],
  overspendingPolicies: [
    { month: "2026-08", categoryId: "internet", policy: "carry-category" },
  ],
  transactions: [
    { id: "july-spend", accountId: "checking", date: "2026-07-31", categoryId: "internet", amount: -100 },
    { id: "august-spend", accountId: "checking", date: "2026-08-31", categoryId: "internet", amount: -50 },
  ],
});
assert.equal(reversePolicyTransition.months[1]?.categories[0]?.previousAvailable, 0);
assert.equal(reversePolicyTransition.months[1]?.previousOverspending, -100);
assert.equal(reversePolicyTransition.months[1]?.categories[0]?.overspendingPolicy, "carry-category");
assert.equal(reversePolicyTransition.months[2]?.categories[0]?.previousAvailable, -50);
assert.equal(reversePolicyTransition.months[2]?.previousOverspending, 0);

const anchoredOpening = projectBudget({
  budgetId: "opening",
  fromMonth: "2026-08",
  throughMonth: "2026-08",
  openingReadyToAssign: 500,
  openingPreviousOverspending: -100,
  openingAvailableByCategoryId: { internet: 0 },
  accounts,
  categories: [{ id: "internet", groupId: "bills", overspendingPolicy: "reduce-next-month" }],
  assignments: [],
  transactions: [],
}).months[0]!;
assert.equal(anchoredOpening.carriedForwardReadyToAssign, 500);
assert.equal(anchoredOpening.previousOverspending, -100);
assert.equal(anchoredOpening.readyToAssign, 400);

const invalidBase: BudgetProjectionInput = {
  budgetId: "budget",
  fromMonth: "2026-07",
  throughMonth: "2026-07",
  accounts,
  categories,
  assignments: [],
  transactions: [],
};
assert.throws(() => projectBudget({ ...invalidBase, openingReadyToAssign: 0.5 }), /integer minor units/);
assert.throws(() => projectBudget({ ...invalidBase, openingAvailableByCategoryId: { missing: 1 } }), /unknown category/);
assert.throws(() => projectBudget({ ...invalidBase, transactions: [{ id: "bad-date", accountId: "checking", date: "2026-02-31", categoryId: "carry", amount: -1 }] }), /Invalid transaction date/);
assert.throws(() => projectBudget({ ...invalidBase, transactions: [{ id: "bad-split", accountId: "checking", date: "2026-07-01", categoryId: null, amount: -100, splits: [{ id: "line", categoryId: "carry", amount: -99 }] }] }), /does not conserve/);

const legacyMonth = createBudgetMonth("budget", "2026-07");
const negative = createCategoryMonth(legacyMonth.id, "carry", 0, 0, -500);
assert.equal(rolloverBudgetMonth(legacyMonth, [negative], "2026-08").categoryMonths[0]!.previousAvailable, 0);
assert.equal(
  rolloverBudgetMonth(legacyMonth, [negative], "2026-08", {
    overspendingPolicyByCategoryId: { carry: "carry-category" },
  }).categoryMonths[0]!.previousAvailable,
  -500,
);

console.log("Milestone 4 budget-engine projection passed: integer invariants, rollover policies, grouping, splits, transfers, and rebuilds.");
