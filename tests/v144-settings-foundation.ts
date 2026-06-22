import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import {
  currencySymbolOptions,
  defaultSettingsPreferences,
  readSettingsPreferences,
  writeSettingsPreferences,
} from "../apps/web/src/features/settings/settingsPreferences";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}

const emptyActivity: BudgetActivityPersistencePort = {
  async listRegisterTransactionsForBudgetActivity() {
    return [];
  },
  async countCategoryReferences() {
    return {
      registerTransactionCount: 0,
      registerSplitLineCount: 0,
      scheduledTransactionCount: 0,
    };
  },
  async renameRegisterCategoryReferences() {},
  async rewriteCategoryReferences() {},
};

const storage = createMemoryStorage();
const defaults = readSettingsPreferences(storage);

assert(defaults.budget.budgetName === "Household Budget", "default budget name should be available");
assert(defaults.budget.currencyCode === "AUD", "default budget currency should be AUD");
assert(defaults.general.dateFormat === "DD/MM/YYYY", "default date format should be Australian style");
assert(defaults.budget.futureMonthLimit === 3, "default future month limit should match the few-months-ahead policy");

const saved = writeSettingsPreferences(storage, {
  general: {
    ...defaultSettingsPreferences.general,
    dateFormat: "YYYY-MM-DD",
    numberFormat: "1.234,56",
    firstDayOfWeek: "sunday",
  },
  budget: {
    ...defaultSettingsPreferences.budget,
    budgetName: "Renamed Budget",
    currencyCode: "GBP",
    currencySymbol: "£",
    decimalPlaces: 3,
    futureMonthLimit: 6,
  },
});

assert(saved.budget.budgetName === "Renamed Budget", "budget rename should be persisted");
assert(saved.budget.currencyCode === "GBP", "budget currency should be persisted");
assert(saved.budget.currencySymbol === "£", "budget currency symbol should be persisted");
assert(
  currencySymbolOptions.some((option) => option.symbol === "£"),
  "currency symbol should be selectable from the supported symbol list",
);
assert(saved.general.dateFormat === "YYYY-MM-DD", "date format should be persisted");

const service = createBudgetViewService({
  budgetActivity: emptyActivity,
  storage,
});

const view = await service.getBudgetMonthView({
  budgetId: "household",
  month: "2026-06",
});

assert(view.budgetName === "Renamed Budget", "budget view should use the saved budget name");
assert(view.currencyCode === "GBP", "budget view should use the saved currency code");

writeSettingsPreferences(storage, {
  general: defaultSettingsPreferences.general,
  budget: {
    ...defaultSettingsPreferences.budget,
    budgetName: "Normalised Budget",
    decimalPlaces: 99,
    futureMonthLimit: 99,
  },
});

const normalised = readSettingsPreferences(storage);
assert(normalised.budget.decimalPlaces === 4, "decimal places should be clamped to the supported maximum");
assert(normalised.budget.futureMonthLimit === 12, "future month limit should be clamped to the supported maximum");

console.log("v1.44 settings foundation validation passed");
