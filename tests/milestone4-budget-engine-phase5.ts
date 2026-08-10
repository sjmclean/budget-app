import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  projectBudget,
  reconcileBudgetProjection,
  type BudgetProjectionInput,
} from "../packages/budget-engine/src/index.ts";

const accounts = [
  { id: "checking", participation: "on-budget" as const, type: "cash" as const },
  { id: "visa", participation: "on-budget" as const, type: "credit-card" as const },
];
const categories = [
  { id: "groceries", groupId: "living", overspendingPolicy: "reduce-next-month" as const },
  { id: "visa-payment", groupId: "credit-card-payments", overspendingPolicy: "reduce-next-month" as const },
];
const base: BudgetProjectionInput = {
  budgetId: "ynab4-import",
  fromMonth: "2026-07",
  throughMonth: "2026-07",
  accounts,
  categories,
  assignments: [{ month: "2026-07", categoryId: "groceries", amount: 5_000 }],
  transactions: [
    { id: "purchase-1", accountId: "visa", date: "2026-07-01", categoryId: "groceries", amount: -4_000 },
    { id: "purchase-2", accountId: "visa", date: "2026-07-02", categoryId: "groceries", amount: -2_000 },
    { id: "refund", accountId: "visa", date: "2026-07-03", categoryId: "groceries", amount: 500 },
    { id: "payment", accountId: "checking", date: "2026-07-04", categoryId: null, transferAccountId: "visa", amount: -3_000 },
  ],
};

const manual = projectBudget(base).months[0]!;
assert.deepEqual(reconcileBudgetProjection(manual, {
  month: "2026-07",
  categoryActivityById: { groceries: -5_500, "visa-payment": 0 },
  categoryAvailableById: { groceries: -500 },
}), []);

const funded = projectBudget({
  ...base,
  creditCardPolicy: "payment-funding",
  paymentCategoryIdByAccountId: { visa: "visa-payment" },
}).months[0]!;
assert.deepEqual(reconcileBudgetProjection(funded, {
  month: "2026-07",
  categoryActivityById: { groceries: -5_500, "visa-payment": 1_500 },
  categoryAvailableById: { groceries: -500, "visa-payment": 1_500 },
}), []);
assert.equal(reconcileBudgetProjection(funded, {
  month: "2026-07",
  categoryActivityById: { "visa-payment": 1_499 },
}, 1).length, 0);

const largeTransactions = Array.from({ length: 100_000 }, (_, index) => ({
  id: `transaction-${String(index).padStart(6, "0")}`,
  accountId: index % 5 === 0 ? "visa" : "checking",
  date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
  categoryId: "groceries",
  amount: -1,
}));
const started = performance.now();
const large = projectBudget({
  ...base,
  assignments: [],
  transactions: largeTransactions,
}).months[0]!;
const elapsed = performance.now() - started;
assert.equal(large.categories.find(({ categoryId }) => categoryId === "groceries")?.activity, -100_000);
assert.ok(elapsed < 15_000, `100,000-row projection took ${elapsed.toFixed(1)} ms`);

console.log(
  `Milestone 4 Phase 5 passed: manual/payment-funded cards, YNAB4 evidence reconciliation, and 100,000 rows in ${elapsed.toFixed(1)} ms.`,
);
