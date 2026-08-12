import type { BudgetSummary } from "../budgetRegistry";
import type { BudgetCategoryGroupView, BudgetMonthView } from "../budgetViewTypes";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort";
import { createBudgetRegistryEntry } from "../budgetRegistry";
import { getCurrentBudgetMonth } from "../budgetMonthNavigation";
import { getSelectedCategoryGroups, type NewBudgetSetup } from "./budgetTemplates";
import { createFixedBudgetScopedStorage } from "../budgetDataScope.js";
import { syncCategoryEntities } from "../categoryEntities.js";
import { writeBudgetMonthEntity } from "../entities/budgetMonthEntity.js";


function monthLabelFromIsoMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return month;
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

export function createBudgetMonthView(budget: BudgetSummary, setup: NewBudgetSetup, now = new Date()): BudgetMonthView {
  const month = getCurrentBudgetMonth(now);
  const categoryGroups: BudgetCategoryGroupView[] = getSelectedCategoryGroups(setup.categoryGroups).map((group) => ({
    id: group.id,
    name: group.name,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    categories: group.categories.map((category) => ({
      id: category.id,
      name: category.name,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      isOverspent: false,
      isArchived: false,
      overspendingHandling: "reduce-next-month",
      note: "",
    })),
  }));

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    monthLabel: monthLabelFromIsoMonth(month),
    currencyCode: setup.currency,
    readyToAssign: 0,
    totalAssigned: 0,
    totalActivity: 0,
    totalAvailable: 0,
    categoryGroups,
  };
}

export function createBudgetFromSetup(
  storage: KeyValueStoragePort,
  setup: NewBudgetSetup,
  now = new Date(),
): BudgetSummary {
  const budget = createBudgetRegistryEntry(storage, {
    name: setup.name,
    currency: setup.currency,
    dateFormat: setup.dateFormat,
    numberFormat: setup.numberFormat,
    firstDayOfWeek: setup.firstDayOfWeek,
    now,
  });
  const month = getCurrentBudgetMonth(now);
  const view = createBudgetMonthView(budget, setup, now);
  syncCategoryEntities(createFixedBudgetScopedStorage(storage, budget.id), view, now);
  writeBudgetMonthEntity(storage, budget.id, month, view, now);
  return budget;
}
