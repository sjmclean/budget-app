import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort";
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

function createMemoryBudgetActivity(): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return [
        {
          id: "tx-groceries-overspend",
          accountId: "checking",
          accountName: "Checking",
          accountType: "budget",
          date: "2026-07-05",
          payee: "Supermarket",
          category: "Groceries",
          categoryId: "groceries",
          inflow: 0,
          outflow: 7000,
        },
      ];
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

async function testCoverOverspendingMovesAssignedMoneyAtomically() {
  const storage = new MemoryStorage();
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
              assigned: 5000,
              activity: 0,
              available: 5000,
              isOverspent: true,
              isArchived: false,
              note: "",
            },
            {
              id: "buffer",
              name: "Buffer",
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

  const service = createBudgetViewService({
    storage,
    budgetActivity: createMemoryBudgetActivity(),
  });

  const nextView = await service.coverOverspending({
    budgetId: "household",
    month: "2026-07",
    overspentCategoryId: "groceries",
    coveringCategoryId: "buffer",
    amount: 2000,
  });

  const categories = nextView.categoryGroups[0]?.categories ?? [];
  const groceries = categories.find((category) => category.id === "groceries");
  const buffer = categories.find((category) => category.id === "buffer");

  assert.equal(groceries?.assigned, 7000);
  assert.equal(groceries?.available, 0);
  assert.equal(groceries?.isOverspent, false);
  assert.equal(buffer?.assigned, 8000);
  assert.equal(buffer?.available, 8000);
}

function testBudgetPageExposesOverspendingResolutionUi() {
  const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
  const budgetTypes = readFileSync("apps/web/src/features/budget/budgetViewTypes.ts", "utf8");
  const workspaceHook = readFileSync("apps/web/src/features/budget/useBudgetWorkspace.ts", "utf8");
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(budgetTypes, /coverOverspending/, "Budget service should expose an atomic cover overspending command");
  assert.match(workspaceHook, /coverOverspending/, "Budget workspace hook should expose overspending resolution");
  assert.match(budgetPage, /OverspendingResolutionPanel/, "Budget page should render the overspending resolution panel");
  assert.match(budgetPage, /Cover overspending/, "Budget page should offer a clear cover action");
  assert.match(packageJson, /test:v2490/, "Release scripts should include v2.49.0 checks");
}

async function run() {
  await testCoverOverspendingMovesAssignedMoneyAtomically();
  testBudgetPageExposesOverspendingResolutionUi();
  console.log("v2.49.0 overspending resolution workflow checks passed");
}

void run();
