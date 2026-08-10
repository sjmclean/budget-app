import assert from "node:assert/strict";
import {
  mergeHostedBudgetCatalogue,
  readBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import { DEFAULT_BUDGET_PREFERENCES } from
  "../apps/web/src/features/budget/budgetPreferences";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
  removeItem: (key: string) => {
    values.delete(key);
  },
};

writeBudgetRegistry(storage, [{
  id: "local-budget",
  name: "Local",
  currency: "AUD",
  preferences: { ...DEFAULT_BUDGET_PREFERENCES },
  lastOpenedLabel: "Not opened yet",
  packagePath: "~/Budgets/Local.budget",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}]);

mergeHostedBudgetCatalogue(storage, [{
  budgetId: "hosted-budget",
  name: "Hosted household",
  currency: "NZD",
  role: "owner",
  createdAt: "2026-02-01T00:00:00.000Z",
}], new Date("2026-07-29T00:00:00.000Z"));

mergeHostedBudgetCatalogue(storage, [{
  budgetId: "hosted-budget",
  name: "Duplicate must not be added",
  currency: "USD",
  role: "owner",
  createdAt: "2026-02-01T00:00:00.000Z",
}]);

const budgets = readBudgetRegistry(storage);
assert.equal(budgets.length, 2);
assert.equal(budgets.find(({ id }) => id === "local-budget")?.name, "Local");
const hosted = budgets.find(({ id }) => id === "hosted-budget");
assert.equal(hosted?.name, "Hosted household");
assert.equal(hosted?.currency, "NZD");
assert.equal(hosted?.packagePath, "hosted://hosted-budget");
assert.equal(hosted?.lastOpenedLabel, "Available from server");

console.log("Milestone 3 hosted budget catalogue hydration passed.");
