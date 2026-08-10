import assert from "node:assert/strict";
import test from "node:test";

import { mapYnab4BudgetMonths } from "../../../apps/web/src/features/budget/ynab4/mapYnab4BudgetMonths.js";

const templateGroups = [
  {
    id: "group-household",
    name: "Household",
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    categories: [
      {
        id: "category-groceries",
        name: "Groceries",
        sourceCategoryId: "source-groceries",
        previousAvailable: 0,
        assigned: 0,
        activity: 0,
        available: 0,
        isOverspent: false,
        isArchived: false,
        note: "",
      },
    ],
  },
];

const registers = {
  checking: {
    accountId: "checking",
    accountName: "Checking",
    accountType: "On budget",
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: -25,
    workingBalance: -25,
    transactions: [
      {
        id: "transaction-1",
        date: "2026-01-15",
        payee: "Supermarket",
        category: "Groceries",
        categoryId: "category-groceries",
        memo: "",
        attachmentCount: 0,
        outflow: 25,
        inflow: 0,
        runningBalance: -25,
        cleared: false,
        reconciled: false,
      },
    ],
  },
};

test("maps assigned, activity, available and ready-to-assign values", () => {
  const views = mapYnab4BudgetMonths({
    budget: { id: "budget-1", name: "Imported", currency: "AUD" },
    monthlyBudgets: [
      {
        month: "2026-01",
        availableToBudget: 125,
        incomeForMonth: 225,
        monthlySubCategoryBudgets: [
          {
            categoryId: "source-groceries",
            budgeted: 100,
            overspendingHandling: "Confined",
          },
        ],
      },
    ],
    templateGroups,
    categoryIdBySourceId: new Map([
      ["source-groceries", "category-groceries"],
    ]),
    registers,
    now: new Date("2026-01-01T00:00:00Z"),
  });

  const january = views.get("2026-01");
  assert.ok(january);
  assert.equal(january.readyToAssign, 125);
  assert.equal(january.carriedForwardReadyToAssign, 0);
  assert.equal(january.incomeForMonth, 225);
  assert.equal(january.previousOverspending, 0);
  assert.equal(january.totalAssigned, 100);
  assert.equal(january.totalActivity, -25);
  assert.equal(january.totalAvailable, 75);
  assert.equal(january.categoryGroups[0].categories[0].available, 75);
});

test("carries positive balances forward and confines negative overspending", () => {
  const views = mapYnab4BudgetMonths({
    budget: { id: "budget-1", name: "Imported", currency: "AUD" },
    monthlyBudgets: [
      {
        month: "2026-01",
        monthlySubCategoryBudgets: [
          { categoryId: "source-groceries", budgeted: 50 },
        ],
      },
      {
        month: "2026-02",
        monthlySubCategoryBudgets: [
          {
            categoryId: "source-groceries",
            budgeted: 0,
            overspendingHandling: "Confined",
          },
        ],
      },
    ],
    templateGroups,
    categoryIdBySourceId: new Map([
      ["source-groceries", "category-groceries"],
    ]),
    registers: {},
    now: new Date("2026-01-01T00:00:00Z"),
  });

  assert.equal(
    views.get("2026-02")?.categoryGroups[0].categories[0].previousAvailable,
    50,
  );
});

test("creates the current month when the source contains no monthly budgets", () => {
  const views = mapYnab4BudgetMonths({
    budget: { id: "budget-1", name: "Imported", currency: "AUD" },
    monthlyBudgets: [],
    templateGroups,
    categoryIdBySourceId: new Map(),
    registers: {},
    now: new Date("2026-03-10T00:00:00Z"),
  });

  assert.ok(views.has("2026-03"));
});

test("creates transaction-only months and fills gaps in the budget timeline", () => {
  const views = mapYnab4BudgetMonths({
    budget: { id: "budget-1", name: "Imported", currency: "AUD" },
    monthlyBudgets: [
      {
        month: "2026-01",
        monthlySubCategoryBudgets: [
          { categoryId: "source-groceries", budgeted: 100 },
        ],
      },
      {
        month: "2026-04",
        monthlySubCategoryBudgets: [],
      },
    ],
    templateGroups,
    categoryIdBySourceId: new Map([
      ["source-groceries", "category-groceries"],
    ]),
    registers: {
      checking: {
        ...registers.checking,
        transactions: [
          {
            ...registers.checking.transactions[0],
            id: "transaction-february",
            date: "2026-02-15",
            outflow: 25,
            runningBalance: -25,
          },
          {
            ...registers.checking.transactions[0],
            id: "transaction-may",
            date: "2026-05-03",
            outflow: 10,
            runningBalance: -35,
          },
        ],
      },
    },
    now: new Date("2026-01-01T00:00:00Z"),
  });

  assert.deepEqual([...views.keys()], [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
  ]);
  assert.equal(views.get("2026-02")?.totalActivity, -25);
  assert.equal(views.get("2026-03")?.totalActivity, 0);
  assert.equal(views.get("2026-05")?.totalActivity, -10);
  assert.equal(
    views.get("2026-02")?.categoryGroups[0].categories[0].previousAvailable,
    100,
  );
  assert.equal(
    views.get("2026-03")?.categoryGroups[0].categories[0].previousAvailable,
    75,
  );
});

test("creates a transaction month when there are no source budget rows", () => {
  const views = mapYnab4BudgetMonths({
    budget: { id: "budget-1", name: "Imported", currency: "AUD" },
    monthlyBudgets: [],
    templateGroups,
    categoryIdBySourceId: new Map([
      ["source-groceries", "category-groceries"],
    ]),
    registers,
    now: new Date("2026-03-10T00:00:00Z"),
  });

  assert.deepEqual([...views.keys()], ["2026-01"]);
  assert.equal(views.get("2026-01")?.totalActivity, -25);
});
