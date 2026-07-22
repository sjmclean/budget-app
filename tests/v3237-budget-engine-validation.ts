import assert from "node:assert/strict";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.ts";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort.ts";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";

class MemoryStorage implements KeyValueStoragePort {
  private readonly records = new Map<string, string>();

  getItem(key: string): string | null {
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.records.set(key, value);
  }

  removeItem(key: string): void {
    this.records.delete(key);
  }

  listKeys(): string[] {
    return [...this.records.keys()].sort();
  }
}

function activity(transactions: Awaited<ReturnType<BudgetActivityPersistencePort["listRegisterTransactionsForBudgetActivity"]>> = []): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return transactions;
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
}


function categoryOutflow(input: {
  id: string;
  date: string;
  categoryId: string;
  amount: number;
}) {
  return {
    id: input.id,
    accountId: "checking",
    accountName: "Checking",
    accountType: "on-budget" as const,
    date: input.date,
    payee: "Test payee",
    category: input.categoryId,
    categoryId: input.categoryId,
    inflow: 0,
    outflow: input.amount,
  };
}

function monthView(input: {
  monthLabel: string;
  readyToAssign?: number;
  categories: Array<{
    id: string;
    available: number;
    handling?: "reduce-next-month" | "carry-category";
  }>;
}): BudgetMonthView {
  const categories = input.categories.map((category) => ({
    id: category.id,
    name: category.id,
    previousAvailable: 0,
    assigned: 0,
    activity: category.available,
    available: category.available,
    isOverspent: category.available < 0,
    isArchived: false,
    overspendingHandling: category.handling ?? "reduce-next-month",
    note: "",
  }));

  return {
    budgetId: "household",
    budgetName: "Household Budget",
    monthLabel: input.monthLabel,
    currencyCode: "AUD",
    readyToAssign: input.readyToAssign ?? 0,
    incomeForMonth: 0,
    totalAssigned: 0,
    totalActivity: categories.reduce((sum, category) => sum + category.activity, 0),
    totalAvailable: categories.reduce((sum, category) => sum + category.available, 0),
    categoryGroups: [
      {
        id: "main",
        name: "Main",
        previousAvailable: 0,
        assigned: 0,
        activity: categories.reduce((sum, category) => sum + category.activity, 0),
        available: categories.reduce((sum, category) => sum + category.available, 0),
        note: "",
        categories,
      },
    ],
  };
}

function storeMonth(storage: KeyValueStoragePort, month: string, view: BudgetMonthView): void {
  storage.setItem(`budget-app.budget-view.v1.household.${month}`, JSON.stringify(view));
}

async function validatesNonConfinedOverspendingReducesNextMonth(): Promise<void> {
  const storage = new MemoryStorage();
  storeMonth(storage, "2026-07", monthView({
    monthLabel: "July 2026",
    categories: [{ id: "fuel", available: -8303 }],
  }));

  const august = await createBudgetViewService({
    storage,
    budgetActivity: activity([
      categoryOutflow({ id: "fuel-july", date: "2026-07-15", categoryId: "fuel", amount: 8303 }),
    ]),
  }).getBudgetMonthView({ budgetId: "household", month: "2026-08" });

  assert.equal(august.carriedForwardReadyToAssign, 0);
  assert.equal(august.previousOverspending, -8303);
  assert.equal(august.incomeForMonth, 0);
  assert.equal(august.totalAssigned, 0);
  assert.equal(august.readyToAssign, -8303);
  assert.equal(august.categoryGroups[0]?.categories[0]?.previousAvailable, 0);
}

async function validatesConfinedOverspendingStaysInCategory(): Promise<void> {
  const storage = new MemoryStorage();
  storeMonth(storage, "2026-07", monthView({
    monthLabel: "July 2026",
    categories: [{ id: "fuel", available: -8303, handling: "carry-category" }],
  }));

  const august = await createBudgetViewService({
    storage,
    budgetActivity: activity([
      categoryOutflow({ id: "fuel-july", date: "2026-07-15", categoryId: "fuel", amount: 8303 }),
    ]),
  }).getBudgetMonthView({ budgetId: "household", month: "2026-08" });

  assert.equal(august.previousOverspending, 0);
  assert.equal(august.incomeForMonth, 0);
  assert.equal(august.readyToAssign, 0);
  assert.equal(august.categoryGroups[0]?.categories[0]?.previousAvailable, -8303);
  assert.equal(august.categoryGroups[0]?.categories[0]?.available, -8303);
}

async function validatesCurrentMonthIncomeIsExplicitAndDoesNotMaskOverspending(): Promise<void> {
  const storage = new MemoryStorage();
  storeMonth(storage, "2026-07", monthView({
    monthLabel: "July 2026",
    categories: [{ id: "fuel", available: -8303 }],
  }));

  const augustIncome = 20000;
  const august = await createBudgetViewService({
    storage,
    budgetActivity: activity([
      categoryOutflow({ id: "fuel-july", date: "2026-07-15", categoryId: "fuel", amount: 8303 }),
      {
        id: "income-august",
        accountId: "checking",
        accountName: "Checking",
        accountType: "on-budget",
        date: "2026-08-01",
        payee: "Employer",
        category: "Ready to Assign",
        categoryId: "__ready_to_assign__",
        inflow: augustIncome,
        outflow: 0,
      },
    ]),
  }).getBudgetMonthView({ budgetId: "household", month: "2026-08" });

  assert.equal(august.previousOverspending, -8303);
  assert.equal(august.incomeForMonth, augustIncome);
  assert.equal(august.readyToAssign, augustIncome - 8303);
}

async function validatesLegacyGeneratedFutureMonthIsRefreshed(): Promise<void> {
  const storage = new MemoryStorage();
  const july = monthView({
    monthLabel: "July 2026",
    categories: [
      { id: "buffer", available: 5000 },
      { id: "fuel", available: -8303 },
    ],
  });
  // The buffer is an opening balance, not register activity. Keeping that
  // distinction lets activity recalculation preserve the positive rollover.
  july.categoryGroups[0]!.categories[0]!.previousAvailable = 5000;
  july.categoryGroups[0]!.categories[0]!.activity = 0;
  july.categoryGroups[0]!.activity = -8303;
  july.totalActivity = -8303;
  storeMonth(storage, "2026-07", july);

  const legacyAugust = monthView({
    monthLabel: "August 2026",
    readyToAssign: 0,
    categories: [
      { id: "buffer", available: 5000 },
      { id: "fuel", available: 0 },
    ],
  });
  legacyAugust.categoryGroups[0]!.categories[0]!.previousAvailable = 5000;
  legacyAugust.categoryGroups[0]!.categories[0]!.activity = 0;
  legacyAugust.categoryGroups[0]!.categories[1]!.previousAvailable = 0;
  legacyAugust.categoryGroups[0]!.categories[1]!.activity = 0;
  legacyAugust.categoryGroups[0]!.activity = 0;
  legacyAugust.totalActivity = 0;
  delete legacyAugust.incomeForMonth;
  storeMonth(storage, "2026-08", legacyAugust);

  const august = await createBudgetViewService({
    storage,
    budgetActivity: activity([
      categoryOutflow({ id: "fuel-july", date: "2026-07-15", categoryId: "fuel", amount: 8303 }),
    ]),
  }).getBudgetMonthView({ budgetId: "household", month: "2026-08" });

  assert.equal(august.previousOverspending, -8303);
  assert.equal(august.incomeForMonth, 0);
  assert.equal(august.readyToAssign, -8303);
  assert.equal(august.rolloverSourceMonth, "2026-07");
}

async function validatesMultiMonthRolloverRefreshesInSequence(): Promise<void> {
  const storage = new MemoryStorage();
  storeMonth(storage, "2026-07", monthView({
    monthLabel: "July 2026",
    categories: [{ id: "fuel", available: -8303 }],
  }));

  const service = createBudgetViewService({
    storage,
    budgetActivity: activity([
      categoryOutflow({ id: "fuel-july", date: "2026-07-15", categoryId: "fuel", amount: 8303 }),
    ]),
  });
  await service.getBudgetMonthView({ budgetId: "household", month: "2026-08" });
  const september = await service.getBudgetMonthView({ budgetId: "household", month: "2026-09" });

  assert.equal(september.carriedForwardReadyToAssign, -8303);
  assert.equal(september.previousOverspending, 0);
  assert.equal(september.incomeForMonth, 0);
  assert.equal(september.readyToAssign, -8303);
}

await validatesNonConfinedOverspendingReducesNextMonth();
await validatesConfinedOverspendingStaysInCategory();
await validatesCurrentMonthIncomeIsExplicitAndDoesNotMaskOverspending();
await validatesLegacyGeneratedFutureMonthIsRefreshed();
await validatesMultiMonthRolloverRefreshesInSequence();

console.log("v3.23.7 budget engine validation passed");
