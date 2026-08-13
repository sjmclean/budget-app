import assert from "node:assert/strict";
import test from "node:test";

import type { FullBudgetImportPreview } from "../../../packages/types/src/BankImport.js";
import {
  createActualBudgetLauncherImport,
} from "../../../apps/web/src/features/budget/actualBudgetLauncherImport.js";
import {
  readBudgetMonthEntity,
} from "../../../apps/web/src/features/budget/entities/budgetMonthEntity.js";
import {
  createFixedBudgetScopedStorage,
} from "../../../apps/web/src/features/budget/budgetDataScope.js";
import {
  readTransactionRegisters,
} from "../../../apps/web/src/features/accounts/entities/transactionEntityPersistence.js";
import type {
  BudgetMonthView,
} from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import type {
  KeyValueStoragePort,
} from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";

function createMemoryStorage(): KeyValueStoragePort & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

function basePreview(
  overrides: Partial<FullBudgetImportPreview> = {},
): FullBudgetImportPreview {
  return {
    format: "actual-budget",
    providerId: "actual-budget",
    providerLabel: "Actual Budget",
    sourceBudgetName: "Financial Behaviour",
    entityCounts: [],
    issues: [],
    metadata: { currency: "AUD" },
    accounts: [
      {
        id: "source-checking",
        name: "Checking",
        type: "checking",
        closed: false,
        offBudget: false,
      },
    ],
    categoryGroups: [
      {
        id: "source-income-group",
        name: "Income",
        hidden: false,
        isIncome: true,
      },
      {
        id: "source-spending-group",
        name: "Living",
        hidden: false,
        isIncome: false,
      },
    ],
    categories: [
      {
        id: "source-income",
        name: "Salary",
        groupId: "source-income-group",
        groupName: "Income",
        hidden: false,
        isIncome: true,
      },
      {
        id: "source-groceries",
        name: "Groceries",
        groupId: "source-spending-group",
        groupName: "Living",
        hidden: false,
        isIncome: false,
      },
    ],
    payees: [],
    transactions: [],
    budgetMonths: [],
    transferCount: 0,
    canCommit: true,
    ...overrides,
  };
}

function readMonth(
  storage: KeyValueStoragePort,
  budgetId: string,
  month: string,
): BudgetMonthView {
  const entity = readBudgetMonthEntity(storage, budgetId, month);
  assert.ok(entity, `expected imported budget month ${month}`);

  const candidate = entity as unknown as {
    payload?: BudgetMonthView;
    value?: BudgetMonthView;
    data?: BudgetMonthView;
  };

  return (
    candidate.payload ??
    candidate.value ??
    candidate.data ??
    entity
  ) as unknown as BudgetMonthView;
}

test("Actual import derives Ready to Assign from income and preserves uncategorised spending", () => {
  const storage = createMemoryStorage();

  const result = createActualBudgetLauncherImport(storage, {
    now: new Date("2026-01-31T00:00:00.000Z"),
    preview: basePreview({
      transactions: [
        {
          id: "income-1",
          accountId: "source-checking",
          accountName: "Checking",
          date: "2026-01-05",
          amount: 100_000,
          payeeId: null,
          payeeName: "Employer",
          categoryId: "source-income",
          categoryName: "Salary",
          memo: null,
          cleared: true,
          transferId: null,
          isTransfer: false,
        },
        {
          id: "uncategorised-expense",
          accountId: "source-checking",
          accountName: "Checking",
          date: "2026-01-10",
          amount: -5_000,
          payeeId: null,
          payeeName: "Unknown merchant",
          categoryId: null,
          categoryName: null,
          memo: null,
          cleared: true,
          transferId: null,
          isTransfer: false,
        },
      ],
      budgetMonths: [
        {
          id: "jan-groceries",
          month: "2026-01",
          categoryId: "source-groceries",
          assigned: 20_000,
          carryover: 0,
        },
      ],
    }),
  });

  const january = readMonth(storage, result.budget.id, "2026-01");

  assert.equal(january.incomeForMonth, 1_000);
  assert.equal(january.totalAssigned, 200);
  assert.equal(january.readyToAssign, 800);
  assert.equal(january.carriedForwardReadyToAssign, 0);
  assert.equal(january.previousOverspending, 0);

  const registers = readTransactionRegisters(
    createFixedBudgetScopedStorage(storage, result.budget.id),
  );
  const expense = Object.values(registers)
    .flatMap((register) => register.transactions)
    .find((transaction) => transaction.id === "uncategorised-expense");

  assert.ok(expense, "expected persisted uncategorised expense");
  assert.equal(expense.categoryId, undefined);
  assert.equal(expense.category, "Uncategorised");
  assert.equal(expense.outflow, 50);
});

test("Actual carryover preserves negative category balance without reducing next month's RTA", () => {
  const storage = createMemoryStorage();

  const result = createActualBudgetLauncherImport(storage, {
    now: new Date("2026-02-28T00:00:00.000Z"),
    preview: basePreview({
      transactions: [
        {
          id: "income-jan",
          accountId: "source-checking",
          accountName: "Checking",
          date: "2026-01-01",
          amount: 100_000,
          payeeId: null,
          payeeName: "Employer",
          categoryId: "source-income",
          categoryName: "Salary",
          memo: null,
          cleared: true,
          transferId: null,
          isTransfer: false,
        },
        {
          id: "groceries-jan",
          accountId: "source-checking",
          accountName: "Checking",
          date: "2026-01-15",
          amount: -20_000,
          payeeId: null,
          payeeName: "Supermarket",
          categoryId: "source-groceries",
          categoryName: "Groceries",
          memo: null,
          cleared: true,
          transferId: null,
          isTransfer: false,
        },
      ],
      budgetMonths: [
        {
          id: "jan-groceries",
          month: "2026-01",
          categoryId: "source-groceries",
          assigned: 10_000,
          carryover: 0,
        },
        {
          id: "feb-groceries",
          month: "2026-02",
          categoryId: "source-groceries",
          assigned: 0,
          carryover: 1,
        },
      ],
    }),
  });

  const january = readMonth(storage, result.budget.id, "2026-01");
  const february = readMonth(storage, result.budget.id, "2026-02");

  const januaryGroceries =
    january.categoryGroups
      .flatMap((group) => group.categories)
      .find((category) => category.name === "Groceries");

  const februaryGroceries =
    february.categoryGroups
      .flatMap((group) => group.categories)
      .find((category) => category.name === "Groceries");

  assert.ok(januaryGroceries);
  assert.ok(februaryGroceries);

  assert.equal(januaryGroceries.available, -100);
  assert.equal(januaryGroceries.overspendingHandling, "carry-category");
  assert.equal(februaryGroceries.previousAvailable, -100);
  assert.equal(februaryGroceries.overspendingHandling, "reduce-next-month");
  assert.equal(february.previousOverspending, 0);

  assert.equal(january.readyToAssign, 900);
  assert.equal(february.carriedForwardReadyToAssign, 900);
  assert.equal(february.readyToAssign, 900);
});
