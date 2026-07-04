import { readAccounts } from "../accounts/accountService";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { BudgetActivityRegisterTransaction } from "./budgetActivityPersistencePort";
import type { BudgetCategoryView, BudgetMonthView } from "./budgetViewTypes";

export const CREDIT_CARD_PAYMENT_GROUP_ID = "credit-card-payments";
export const CREDIT_CARD_PAYMENT_GROUP_NAME = "Credit Card Payments";
const CREDIT_CARD_PAYMENT_CATEGORY_ID_PREFIX = "credit-card-payment-";

interface CreditCardPaymentCategoryDependencies {
  storage: KeyValueStoragePort;
}

export function getCreditCardPaymentCategoryId(accountId: string): string {
  return `${CREDIT_CARD_PAYMENT_CATEGORY_ID_PREFIX}${accountId}`;
}

export function isCreditCardPaymentGroup(groupId: string): boolean {
  return groupId === CREDIT_CARD_PAYMENT_GROUP_ID;
}

export function isCreditCardPaymentCategory(categoryId: string): boolean {
  return categoryId.startsWith(CREDIT_CARD_PAYMENT_CATEGORY_ID_PREFIX);
}

function createCreditCardPaymentCategory(
  accountId: string,
  accountName: string,
): BudgetCategoryView {
  return {
    id: getCreditCardPaymentCategoryId(accountId),
    name: accountName,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    isOverspent: false,
    isArchived: false,
    note: "",
  };
}

export function ensureCreditCardPaymentCategories(
  dependencies: CreditCardPaymentCategoryDependencies,
  view: BudgetMonthView,
  transactions: BudgetActivityRegisterTransaction[],
): BudgetMonthView {
  const accountNames = new Map<string, string>();

  for (const account of readAccounts(dependencies.storage)) {
    if (account.type === "credit-card" && !account.closedAt) {
      accountNames.set(account.id, account.name);
    }
  }

  for (const transaction of transactions) {
    if (transaction.accountType === "credit-card") {
      accountNames.set(
        transaction.accountId,
        transaction.accountName ?? accountNames.get(transaction.accountId) ?? transaction.accountId,
      );
    }
  }

  if (accountNames.size === 0) {
    return view;
  }

  const existingCategoryIds = new Set(
    view.categoryGroups.flatMap((group) => group.categories.map((category) => category.id)),
  );
  const missingCategories = [...accountNames]
    .filter(([accountId]) => !existingCategoryIds.has(getCreditCardPaymentCategoryId(accountId)))
    .map(([accountId, accountName]) => createCreditCardPaymentCategory(accountId, accountName));

  if (missingCategories.length === 0) {
    return view;
  }

  const existingPaymentGroup = view.categoryGroups.find((group) =>
  isCreditCardPaymentGroup(group.id),
);

  if (existingPaymentGroup) {
    return {
      ...view,
      categoryGroups: view.categoryGroups.map((group) =>
        isCreditCardPaymentGroup(group.id)
          ? {
              ...group,
              categories: [...group.categories, ...missingCategories],
            }
          : group,
      ),
    };
  }

  return {
    ...view,
    categoryGroups: [
      {
        id: CREDIT_CARD_PAYMENT_GROUP_ID,
        name: CREDIT_CARD_PAYMENT_GROUP_NAME,
        previousAvailable: 0,
        assigned: 0,
        activity: 0,
        available: 0,
        note: "",
        categories: missingCategories,
      },
      ...view.categoryGroups,
    ],
  };
}
