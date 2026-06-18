import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { TransactionType } from "../packages/types/src/TransactionType.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import {
  applyCreditCardBudgetedPurchase,
  applyCreditCardPayment,
  createCategoryMonth,
} from "../packages/budget-engine/src/index.js";

const now = new Date();
const card = {
  id: "card-1",
  budgetId: "budget-1",
  name: "Visa",
  type: AccountType.CreditCard,
  participation: BudgetParticipation.OnBudget,
  openingBalance: -20000,
  currentBalance: -20000,
};

const groceries = createCategoryMonth("bm-1", "groceries", 0, 30000, 0);
const payment = createCategoryMonth("bm-1", "payment-card-1", 0, 0, 0);

const purchase = {
  id: "tx-1",
  budgetId: "budget-1",
  accountId: "card-1",
  payeeId: "payee-1",
  categoryId: "groceries",
  transferAccountId: null,
  type: TransactionType.Standard,
  date: "2026-06-17",
  memo: null,
  amount: -12500,
  clearedStatus: ClearedStatus.Uncleared,
  isDeleted: false,
  createdAt: now,
  updatedAt: now,
};

const purchaseResult = applyCreditCardBudgetedPurchase(
  purchase,
  card,
  groceries,
  payment,
);

if (purchaseResult.sourceCategoryMonth?.available !== 17500) {
  throw new Error(
    "Expected credit-card purchase to reduce spending category available",
  );
}

if (purchaseResult.paymentCategoryMonth.available !== 12500) {
  throw new Error(
    "Expected funded credit-card purchase to increase payment category available",
  );
}

const transferToCard = {
  ...purchase,
  id: "tx-pay",
  payeeId: null,
  categoryId: null,
  type: TransactionType.Transfer,
  accountId: "checking-1",
  transferAccountId: "card-1",
  amount: -10000,
};

const afterPayment = applyCreditCardPayment(
  transferToCard,
  card,
  purchaseResult.paymentCategoryMonth,
);
if (afterPayment.available !== 2500) {
  throw new Error(
    "Expected credit-card payment to consume payment category available",
  );
}

console.log("v1.2.4 credit card engine OK");
