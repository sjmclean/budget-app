import { createSplitTransaction } from "../packages/budget-engine/src/services/createSplitTransaction.js";

const split = createSplitTransaction({
  budgetId: "budget",
  accountId: "checking",
  payeeId: "woolworths",
  date: "2026-06-17",
  amount: -12000,
  lines: [
    {
      categoryId: "groceries",
      amount: -8000
    },
    {
      categoryId: "household",
      amount: -4000
    }
  ]
});

console.log(split);
