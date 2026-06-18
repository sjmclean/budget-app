import { Account } from "../../../types/src/Account.js";
import { AccountType } from "../../../types/src/AccountType.js";
import { BudgetParticipation } from "../../../types/src/BudgetParticipation.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { Transaction } from "../../../types/src/Transaction.js";
import { TransactionType } from "../../../types/src/TransactionType.js";
import { calculateAvailable } from "../calculations/calculateAvailable.js";

export interface CreditCardPaymentCategoryResult {
  paymentCategoryMonth: CategoryMonth;
  sourceCategoryMonth?: CategoryMonth;
  paymentAvailableDelta: number;
}

export function isOnBudgetCreditCard(account: Account): boolean {
  return (
    account.type === AccountType.CreditCard &&
    account.participation === BudgetParticipation.OnBudget
  );
}

export function isCreditCardPurchase(
  transaction: Transaction,
  account: Account,
): boolean {
  return (
    isOnBudgetCreditCard(account) &&
    transaction.type === TransactionType.Standard &&
    transaction.amount < 0
  );
}

export function applyCreditCardBudgetedPurchase(
  transaction: Transaction,
  account: Account,
  sourceCategoryMonth: CategoryMonth,
  paymentCategoryMonth: CategoryMonth,
): CreditCardPaymentCategoryResult {
  if (!isCreditCardPurchase(transaction, account)) {
    return {
      paymentCategoryMonth,
      sourceCategoryMonth,
      paymentAvailableDelta: 0,
    };
  }

  if (
    !transaction.categoryId ||
    transaction.categoryId !== sourceCategoryMonth.categoryId
  ) {
    throw new Error(
      "Credit card purchase must reference the spending category month being adjusted",
    );
  }

  const purchaseAmount = Math.abs(transaction.amount);
  const fundedAmount = Math.min(
    purchaseAmount,
    Math.max(0, sourceCategoryMonth.available),
  );
  const updatedSourceActivity =
    sourceCategoryMonth.activity + transaction.amount;
  const updatedPaymentAssigned = paymentCategoryMonth.assigned + fundedAmount;

  return {
    sourceCategoryMonth: {
      ...sourceCategoryMonth,
      activity: updatedSourceActivity,
      available: calculateAvailable(
        sourceCategoryMonth.previousAvailable,
        sourceCategoryMonth.assigned,
        updatedSourceActivity,
      ),
      updatedAt: new Date(),
    },
    paymentCategoryMonth: {
      ...paymentCategoryMonth,
      assigned: updatedPaymentAssigned,
      available: calculateAvailable(
        paymentCategoryMonth.previousAvailable,
        updatedPaymentAssigned,
        paymentCategoryMonth.activity,
      ),
      updatedAt: new Date(),
    },
    paymentAvailableDelta: fundedAmount,
  };
}

export function applyCreditCardPayment(
  transferOutflow: Transaction,
  creditCardAccount: Account,
  paymentCategoryMonth: CategoryMonth,
): CategoryMonth {
  if (!isOnBudgetCreditCard(creditCardAccount)) {
    throw new Error("Payment account must be an on-budget credit card");
  }

  if (
    transferOutflow.type !== TransactionType.Transfer ||
    transferOutflow.transferAccountId !== creditCardAccount.id
  ) {
    throw new Error(
      "Credit card payment must be a transfer to the credit card account",
    );
  }

  const paymentAmount = Math.abs(transferOutflow.amount);
  const updatedActivity = paymentCategoryMonth.activity - paymentAmount;

  return {
    ...paymentCategoryMonth,
    activity: updatedActivity,
    available: calculateAvailable(
      paymentCategoryMonth.previousAvailable,
      paymentCategoryMonth.assigned,
      updatedActivity,
    ),
    updatedAt: new Date(),
  };
}
