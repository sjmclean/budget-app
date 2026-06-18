import { BudgetSettings } from "../../types/src/BudgetSettings.js";
import { AccountSettings } from "../../types/src/AccountSettings.js";
import { CategorySettings } from "../../types/src/CategorySettings.js";
import { createBudgetSettings } from "../../budget-engine/src/services/createBudgetSettings.js";
import { createAccountSettings } from "../../budget-engine/src/services/createAccountSettings.js";
import { createCategorySettings } from "../../budget-engine/src/services/createCategorySettings.js";

export class SettingsApplicationService {
  createBudgetSettings(budgetId: string, currency = "AUD", symbol = "$"): BudgetSettings {
    return createBudgetSettings(budgetId, currency, symbol);
  }

  createAccountSettings(accountId: string, displayOrder = 0): AccountSettings {
    return createAccountSettings(accountId, displayOrder);
  }

  createCategorySettings(categoryId: string): CategorySettings {
    return createCategorySettings(categoryId);
  }
}
