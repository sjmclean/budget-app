import { createAccount, type CreateAccountInput } from "../../../packages/budget-engine/src/services/createAccount.js";
import { createBudget } from "../../../packages/budget-engine/src/services/createBudget.js";
import { createCategory } from "../../../packages/budget-engine/src/services/createCategory.js";
import { createCategoryGroup } from "../../../packages/budget-engine/src/services/createCategoryGroup.js";
import { createPayee } from "../../../packages/budget-engine/src/services/createPayee.js";
import { createTransaction, type CreateTransactionInput } from "../../../packages/budget-engine/src/services/createTransaction.js";
import { AccountType } from "../../../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../../../packages/types/src/BudgetParticipation.js";

export const DEFAULT_TEST_DATE = "2026-06-17";

export function buildBudget(name = "Household Budget") {
  return createBudget(name);
}

export function buildAccount(
  budgetId: string,
  overrides: Partial<Omit<CreateAccountInput, "budgetId">> = {},
) {
  return createAccount({
    budgetId,
    name: "Checking",
    type: AccountType.Checking,
    participation: BudgetParticipation.OnBudget,
    openingBalance: 0,
    ...overrides,
  });
}

export function buildCategoryGroup(budgetId: string, name = "Everyday", sortOrder = 0) {
  return createCategoryGroup(budgetId, name, sortOrder);
}

export function buildCategory(groupId: string, name = "Groceries", sortOrder = 0) {
  return createCategory(groupId, name, sortOrder);
}

export function buildPayee(budgetId: string, name = "Woolworths") {
  return createPayee(budgetId, name);
}

export function buildTransaction(
  required: Pick<CreateTransactionInput, "budgetId" | "accountId">,
  overrides: Partial<Omit<CreateTransactionInput, "budgetId" | "accountId">> = {},
) {
  return createTransaction({
    ...required,
    date: DEFAULT_TEST_DATE,
    amount: -1_500,
    ...overrides,
  });
}
