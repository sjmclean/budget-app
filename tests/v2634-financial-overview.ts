import assert from "node:assert/strict";
import { buildFinancialOverviewSummary, buildMonthWindow } from "../apps/web/src/pages/dashboard/services/financialOverview";
import type { AccountRegisterView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { SidebarAccount } from "../apps/web/src/features/accounts/accountService";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes";

const accounts: SidebarAccount[] = [
  {
    id: "checking",
    name: "Checking",
    type: "on-budget",
    startingBalance: 1000,
    createdAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
  },
  {
    id: "savings",
    name: "Savings",
    type: "tracking",
    startingBalance: 5000,
    createdAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
  },
];

const registers: AccountRegisterView[] = [
  {
    accountId: "checking",
    accountName: "Checking",
    accountType: "On budget",
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions: [
      {
        id: "salary-june",
        date: "2026-06-01",
        flag: null,
        attachmentCount: 0,
        payee: "Salary",
        category: "Ready To Assign",
        categoryId: "income",
        inflow: 3000,
        outflow: 0,
        runningBalance: 0,
        cleared: true,
        reconciled: false,
      },
      {
        id: "groceries-june",
        date: "2026-06-05",
        flag: null,
        attachmentCount: 0,
        payee: "Aldi",
        category: "Groceries",
        categoryId: "groceries",
        inflow: 0,
        outflow: 200,
        runningBalance: 0,
        cleared: true,
        reconciled: false,
      },
      {
        id: "uncategorised-june",
        date: "2026-06-06",
        flag: null,
        attachmentCount: 0,
        payee: "Unknown Shop",
        category: "",
        inflow: 0,
        outflow: 50,
        runningBalance: 0,
        cleared: true,
        reconciled: false,
      },
      {
        id: "old-may",
        date: "2026-05-20",
        flag: null,
        attachmentCount: 0,
        payee: "Fuel",
        category: "Fuel",
        categoryId: "fuel",
        inflow: 0,
        outflow: 100,
        runningBalance: 0,
        cleared: true,
        reconciled: false,
      },
    ],
  },
  {
    accountId: "savings",
    accountName: "Savings",
    accountType: "Tracking",
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions: [
      {
        id: "interest-june",
        date: "2026-06-30",
        flag: null,
        attachmentCount: 0,
        payee: "Interest",
        category: "Ready To Assign",
        categoryId: "income",
        inflow: 20,
        outflow: 0,
        runningBalance: 0,
        cleared: true,
        reconciled: false,
      },
    ],
  },
];

const budgetView: BudgetMonthView = {
  budgetId: "budget",
  budgetName: "Household",
  monthLabel: "June 2026",
  currencyCode: "AUD",
  readyToAssign: 125,
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
          assigned: 100,
          activity: -200,
          available: -100,
          isOverspent: true,
          isArchived: false,
          note: "",
        },
      ],
    },
  ],
};

assert.deepEqual(buildMonthWindow("2026-06", 3), ["2026-04", "2026-05", "2026-06"]);

const summary = buildFinancialOverviewSummary({
  accounts,
  registers,
  budgetView,
  month: "2026-06",
  monthsToShow: 3,
});

assert.equal(summary.netWorth, 8670);
assert.equal(summary.netWorthChangeThisMonth, 2770);
assert.equal(summary.monthlySnapshot.income, 3020);
assert.equal(summary.monthlySnapshot.expenses, 250);
assert.equal(summary.monthlySnapshot.savings, 2770);
assert.equal(summary.monthlySnapshot.readyToAssign, 125);
assert.equal(summary.attention.overspentCategories, 1);
assert.equal(summary.attention.uncategorisedTransactions, 1);
assert.deepEqual(summary.netWorthTrend.map((point) => point.month), ["2026-04", "2026-05", "2026-06"]);

console.log("v2.63.4 financial overview checks passed");
