import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService";
import { writeBudgetRegistry, type BudgetSummary } from "../apps/web/src/features/budget/budgetRegistry";
import type { BudgetActivityPersistencePort, BudgetActivityRegisterTransaction } from "../apps/web/src/features/budget/budgetActivityPersistencePort";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  private records = new Map<string, string>();

  getItem(key: string): string | null {
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.records.set(key, value);
  }

  removeItem(key: string): void {
    this.records.delete(key);
  }

  keys(): string[] {
    return [...this.records.keys()].sort();
  }
}

function createBudgetSummary(creditCardBehaviour: "normal" | "payment-funding"): BudgetSummary {
  return {
    id: "household",
    name: "Household Budget",
    currency: "AUD",
    dateFormat: "DD/MM/YYYY",
    numberFormat: "1,234.56",
    firstDayOfWeek: "monday",
    preferences: { creditCardBehaviour },
    lastOpenedLabel: "Opened just now",
    packagePath: "~/Budgets/Household.budget",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function createBudgetActivity(transactions: BudgetActivityRegisterTransaction[]): BudgetActivityPersistencePort {
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

function seedBudget(storage: MemoryStorage, creditCardBehaviour: "normal" | "payment-funding") {
  writeBudgetRegistry(storage, [createBudgetSummary(creditCardBehaviour)]);
  storage.setItem(
    "budget-app.accounts.v1",
    JSON.stringify([
      {
        id: "visa",
        name: "Visa",
        type: "credit-card",
        startingBalance: 0,
        createdAt: "2026-07-01T00:00:00.000Z",
        closedAt: null,
      },
    ]),
  );
  storage.setItem(
    "budget-app.budget-view.v1.household.2026-07",
    JSON.stringify({
      budgetId: "household",
      budgetName: "Household Budget",
      monthLabel: "July 2026",
      currencyCode: "AUD",
      readyToAssign: 0,
      totalAssigned: 0,
      totalActivity: 0,
      totalAvailable: 0,
      categoryGroups: [
        {
          id: "everyday",
          name: "Everyday",
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          note: "",
          categories: [
            {
              id: "groceries",
              name: "Groceries",
              previousAvailable: 0,
              assigned: 10000,
              activity: 0,
              available: 10000,
              isOverspent: false,
              isArchived: false,
              note: "",
            },
          ],
        },
      ],
    }),
  );
}

const visaGroceriesPurchase: BudgetActivityRegisterTransaction = {
  id: "tx-visa-groceries",
  accountId: "visa",
  accountName: "Visa",
  accountType: "credit-card",
  date: "2026-07-05",
  payee: "Supermarket",
  category: "Groceries",
  categoryId: "groceries",
  inflow: 0,
  outflow: 2500,
};

async function testNormalCreditCardBehaviourDoesNotCreatePaymentActivity() {
  const storage = new MemoryStorage();
  seedBudget(storage, "normal");
  const service = createBudgetViewService({
    storage,
    budgetActivity: createBudgetActivity([visaGroceriesPurchase]),
  });

  const view = await service.getBudgetMonthView({ budgetId: "household", month: "2026-07" });
  const groceries = view.categoryGroups.flatMap((group) => group.categories).find((category) => category.id === "groceries");
  const paymentGroup = view.categoryGroups.find((group) => group.id === "credit-card-payments");

  assert.equal(groceries?.activity, -2500);
  assert.equal(groceries?.available, 7500);
  assert.equal(paymentGroup, undefined);
}

async function testPaymentFundingRoutesCreditCardPurchasesToPaymentCategory() {
  const storage = new MemoryStorage();
  seedBudget(storage, "payment-funding");
  const service = createBudgetViewService({
    storage,
    budgetActivity: createBudgetActivity([visaGroceriesPurchase]),
  });

  const view = await service.getBudgetMonthView({ budgetId: "household", month: "2026-07" });
  const categories = view.categoryGroups.flatMap((group) => group.categories);
  const groceries = categories.find((category) => category.id === "groceries");
  const payment = categories.find((category) => category.id === "credit-card-payment-visa");

  assert.equal(groceries?.activity, -2500);
  assert.equal(groceries?.available, 7500);
  assert.equal(payment?.name, "Visa");
  assert.equal(payment?.activity, 2500);
  assert.equal(payment?.available, 2500);
}

async function testPaymentFundingRoutesCreditCardPaymentsOutOfPaymentCategory() {
  const storage = new MemoryStorage();
  seedBudget(storage, "payment-funding");
  const service = createBudgetViewService({
    storage,
    budgetActivity: createBudgetActivity([
      visaGroceriesPurchase,
      {
        id: "tx-card-payment",
        accountId: "checking",
        accountName: "Checking",
        accountType: "on-budget",
        date: "2026-07-10",
        payee: "Payment to Visa",
        category: "Transfer: Visa",
        inflow: 0,
        outflow: 1000,
        transferAccountId: "visa",
      },
    ]),
  });

  const view = await service.getBudgetMonthView({ budgetId: "household", month: "2026-07" });
  const payment = view.categoryGroups
    .flatMap((group) => group.categories)
    .find((category) => category.id === "credit-card-payment-visa");

  assert.equal(payment?.activity, 1500);
  assert.equal(payment?.available, 1500);
}

function testReleaseWiring() {
  const serviceSource = readFileSync("apps/web/src/features/budget/budgetViewService.ts", "utf8");
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(serviceSource, /readCreditCardPaymentFundingEnabled/, "Budget view service should route credit-card behaviour through preferences");
  assert.match(
    serviceSource,
    /getCreditCardPaymentCategoryId/,
    "Payment funding should use the shared payment category id helper",
  );
  assert.match(packageJson, /test:v2502/, "Release scripts should include v2.50.2 checks");
}

async function run() {
  await testNormalCreditCardBehaviourDoesNotCreatePaymentActivity();
  await testPaymentFundingRoutesCreditCardPurchasesToPaymentCategory();
  await testPaymentFundingRoutesCreditCardPaymentsOutOfPaymentCategory();
  testReleaseWiring();
  console.log("v2.50.2 credit card engine routing checks passed");
}

void run();
