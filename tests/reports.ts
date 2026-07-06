import assert from "node:assert/strict";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { accountBalances } from "../packages/budget-engine/src/reports/accountBalances.js";
import { spendingByCategory } from "../packages/budget-engine/src/reports/spendingByCategory.js";
import { netWorth } from "../packages/budget-engine/src/reports/netWorth.js";
import { budgetVsActual } from "../packages/budget-engine/src/reports/budgetVsActual.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";

const budgetId = "budget";
const checking = createAccount(
  budgetId,
  "Checking",
  AccountType.Checking,
  BudgetParticipation.OnBudget,
  500000,
);
const savings = createAccount(
  budgetId,
  "Savings",
  AccountType.Savings,
  BudgetParticipation.OffBudget,
  1000000,
);
const groceries = createCategory("food", "Groceries");
const fuel = createCategory("fuel", "Fuel");

const groceryTransaction = createTransaction({
  budgetId,
  accountId: checking.id,
  categoryId: groceries.id,
  date: "2026-06-17",
  amount: -15000,
});
const secondGroceryTransaction = createTransaction({
  budgetId,
  accountId: checking.id,
  categoryId: groceries.id,
  date: "2026-06-20",
  amount: -5000,
});
const fuelTransaction = createTransaction({
  budgetId,
  accountId: checking.id,
  categoryId: fuel.id,
  date: "2026-06-21",
  amount: -7000,
});
const incomeTransaction = createTransaction({
  budgetId,
  accountId: checking.id,
  categoryId: groceries.id,
  date: "2026-06-25",
  amount: 250000,
});

const transactions = [
  groceryTransaction,
  secondGroceryTransaction,
  fuelTransaction,
  incomeTransaction,
];

const balances = accountBalances([checking, savings], transactions);
assert.equal(balances.find((row) => row.accountName === "Checking")?.balance, 500000 - 15000 - 5000 - 7000 + 250000);
assert.equal(balances.find((row) => row.accountName === "Savings")?.balance, 1000000);

const spending = spendingByCategory([groceries, fuel], transactions);
assert.deepEqual(spending, [
  {
    categoryId: groceries.id,
    categoryName: groceries.name,
    total: 20000,
  },
  {
    categoryId: fuel.id,
    categoryName: fuel.name,
    total: 7000,
  },
]);

const budgetPerformance = budgetVsActual([
  {
    categoryId: groceries.id,
    categoryName: groceries.name,
    groupName: "Everyday",
    assigned: 25000,
    activity: -20000,
    available: 5000,
  },
  {
    categoryId: fuel.id,
    categoryName: fuel.name,
    groupName: "Everyday",
    assigned: 5000,
    activity: -7000,
    available: -2000,
  },
]);
assert.deepEqual(budgetPerformance, [
  {
    categoryId: fuel.id,
    categoryName: fuel.name,
    groupName: "Everyday",
    assigned: 5000,
    activity: -7000,
    available: -2000,
    status: "overspent",
  },
  {
    categoryId: groceries.id,
    categoryName: groceries.name,
    groupName: "Everyday",
    assigned: 25000,
    activity: -20000,
    available: 5000,
    status: "on-track",
  },
]);

const worth = netWorth([checking, savings], transactions);
assert.equal(worth.totalOnBudget, 500000 - 15000 - 5000 - 7000 + 250000);
assert.equal(worth.totalOffBudget, 1000000);
assert.equal(worth.netWorth, worth.totalOnBudget + worth.totalOffBudget);

console.log("reporting foundation checks passed");
