import { replaceScheduledTransactionEntities } from "../apps/web/src/features/accounts/entities/scheduledTransactionEntity.js";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.js";
import { seedTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import assert from "node:assert/strict";

import {
  collectBudgetScopedStorageKeys,
  deleteCurrentBudget,
  resetCurrentBudget,
} from "../apps/web/src/features/budget/budgetLifecycle.js";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  createInitialBudgetRegistry,
  readBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry.js";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";
import { readBudgetMonthEntity, writeBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

const storage = new MemoryStorage();
writeBudgetRegistry(storage, createInitialBudgetRegistry());
const household = readBudgetRegistry(storage)[0]!;
const sideBusiness = createBudgetRegistryEntry(storage, {
  name: "Side Business",
  currency: "AUD",
  now: new Date("2026-06-22T00:00:00.000Z"),
});

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);
storage.setItem(getBudgetScopedStorageKey(household.id, "budget-app.accounts.v1"), JSON.stringify([{ id: "everyday" }]));
seedTransactionRegisters(createFixedBudgetScopedStorage(storage, household.id), { everyday: { transactions: [{ id: "txn-1", date: "2026-06-20", payee: "Shop", category: "Groceries", inflow: 0, outflow: 1 }] } });
storage.setItem(getBudgetScopedStorageKey(household.id, "budget-app.payees.v1"), JSON.stringify([{ id: "coles" }]));
replaceScheduledTransactionEntities(createFixedBudgetScopedStorage(storage, household.id), [{ id: "sched-1", accountId: "everyday", tagIds: [], nextDueDate: "2026-07-01", frequency: "monthly", recurrenceInterval: 1, recurrenceUnit: "month", recurrenceAnchorDate: "2026-07-01", endCondition: "never", occurrencesCompleted: 0, weekendPolicy: "same-day", payee: "Rent", category: "Bills", memo: "", outflow: 10, inflow: 0, createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z" }]);
writeBudgetMonthEntity(storage, household.id, "2026-06", { budgetId: household.id, budgetName: household.name, monthLabel: "June 2026", currencyCode: "AUD", readyToAssign: 0, totalAssigned: 0, totalActivity: 0, totalAvailable: 0, categoryGroups: [] });

storage.setItem(getBudgetScopedStorageKey(sideBusiness.id, "budget-app.accounts.v1"), JSON.stringify([{ id: "business-account" }]));
writeBudgetMonthEntity(storage, sideBusiness.id, "2026-06", { budgetId: sideBusiness.id, budgetName: sideBusiness.name, monthLabel: "June 2026", currencyCode: "AUD", readyToAssign: 0, totalAssigned: 0, totalActivity: 0, totalAvailable: 0, categoryGroups: [] });

const householdKeys = collectBudgetScopedStorageKeys(storage, "household").sort();

assert.deepStrictEqual(householdKeys, [
  "budget-app.accounts.v1",
  "budget-app.budgets.household.budget-app.accounts.v1",
  "budget-app.budgets.household.budget-app.entity-replication.v1/scheduled-transaction-index",
  "budget-app.budgets.household.budget-app.entity-replication.v1/scheduled-transaction/sched-1",
  "budget-app.budgets.household.budget-app.entity-replication.v1/transaction-index",
  "budget-app.budgets.household.budget-app.entity-replication.v1/transaction/txn-1",
  "budget-app.budgets.household.budget-app.payees.v1",
]);

const resetResult = resetCurrentBudget(storage, new Date("2026-06-22T10:00:00.000Z"));
assert.equal(resetResult.completed, true, "reset should complete");
assert.equal(resetResult.budgetId, household.id, "reset should target selected budget");
assert.equal(readBudgetRegistry(storage).length, 2, "reset should preserve the budget registry");
assert.equal(storage.getItem(getBudgetScopedStorageKey(household.id, "budget-app.accounts.v1")), null, "reset should remove accounts");
assert.equal(storage.getItem(getBudgetScopedStorageKey(sideBusiness.id, "budget-app.accounts.v1")), JSON.stringify([{ id: "business-account" }]), "reset should not touch other budgets");

const starterView = readBudgetMonthEntity(storage, household.id, "2026-06");
assert.ok(starterView, "reset should recreate starter categories for the current month");
assert.equal(starterView.budgetId, household.id);
assert.equal(starterView.budgetName, "Household Budget");
assert.equal(starterView.currencyCode, "AUD");
assert.equal(starterView.readyToAssign, 0);
assert.ok(starterView.categoryGroups.length > 0, "starter category template should be reapplied");

const deleteResult = deleteCurrentBudget(storage);
assert.equal(deleteResult.completed, true, "delete should complete");
assert.equal(deleteResult.budgetId, household.id, "delete should target selected budget");
assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), null, "delete should clear selected budget");
assert.deepEqual(readBudgetRegistry(storage).map((budget) => budget.id), [sideBusiness.id], "delete should remove only the selected budget registry entry");
assert.equal(readBudgetMonthEntity(storage, household.id, "2026-06"), null, "delete should remove reset starter view too");
assert.ok(readBudgetMonthEntity(storage, sideBusiness.id, "2026-06"), "delete should preserve other budget data");
assert.ok(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY), "registry storage should remain present");

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, sideBusiness.id);
const finalDelete = deleteCurrentBudget(storage);
assert.equal(finalDelete.completed, true, "last budget delete should be allowed");
assert.equal(finalDelete.remainingBudgets, 0, "last budget delete should leave an empty registry");
assert.deepEqual(readBudgetRegistry(storage), [], "empty registry should represent first-run state after deleting last budget");
assert.ok(finalDelete.warnings.some((warning) => warning.includes("No budgets remain")), "last budget delete should explain first-run outcome");

console.log("v1.51 budget lifecycle checks passed");
