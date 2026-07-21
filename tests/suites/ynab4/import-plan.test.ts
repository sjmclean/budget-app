import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BUDGET_PREFERENCES } from "../../../apps/web/src/features/budget/budgetPreferences.js";
import {
  buildYnab4LauncherImportPlan,
  writeYnab4LauncherImportPlan,
} from "../../../apps/web/src/features/budget/ynab4LauncherImport.js";
import type { BudgetSummary } from "../../../apps/web/src/features/budget/budgetRegistry.js";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";

function createBudget(): BudgetSummary {
  return {
    id: "budget-import-plan-test",
    name: "YNAB4 Import Plan Test",
    currency: "AUD",
    preferences: DEFAULT_BUDGET_PREFERENCES,
    lastOpenedLabel: "Not opened yet",
    packagePath: "~/Budgets/YNAB4ImportPlanTest.budget",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

function createMemoryStorage(): KeyValueStoragePort & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

test("builds a persistence-independent launcher import plan before writing", () => {
  const plan = buildYnab4LauncherImportPlan(
    createBudget(),
    {
      accounts: [],
      masterCategories: [],
      payees: [],
      transactions: [],
      scheduledTransactions: [],
      monthlyBudgets: [
        {
          entityId: "month-2026-07",
          month: "2026-07-01",
          monthlySubCategoryBudgets: [],
        },
      ],
    },
    new Date("2026-07-20T00:00:00.000Z"),
  );

  assert.equal(plan.budgetId, "budget-import-plan-test");
  assert.deepEqual(plan.accounts, []);
  assert.deepEqual(plan.payees, []);
  assert.deepEqual(plan.transactionTags, []);
  assert.deepEqual(plan.registers, {});
  assert.deepEqual(plan.scheduledTransactions, []);
  assert.equal(plan.budgetMonths.size, 1);
  assert.ok(plan.budgetMonths.has("2026-07"));
});

test("writes only the supplied import plan to budget-scoped storage", () => {
  const storage = createMemoryStorage();
  const plan = buildYnab4LauncherImportPlan(
    createBudget(),
    {
      accounts: [],
      masterCategories: [],
      payees: [],
      transactions: [],
      scheduledTransactions: [],
      monthlyBudgets: [
        {
          entityId: "month-2026-07",
          month: "2026-07-01",
          monthlySubCategoryBudgets: [],
        },
      ],
    },
    new Date("2026-07-20T00:00:00.000Z"),
  );

  writeYnab4LauncherImportPlan(storage, plan);

  assert.ok(
    storage.values.has(
      "budget-app.budgets.budget-import-plan-test.budget-app.accounts.v1",
    ),
  );
  assert.ok(
    storage.values.has(
      "budget-app.budget-view.v1.budget-import-plan-test.2026-07",
    ),
  );
  assert.equal(storage.values.size, 6);
});

test("skips tombstoned accounts and payees", () => {
  const plan = buildYnab4LauncherImportPlan(
    createBudget(),
    {
      accounts: [
        {
          entityId: "live-account",
          accountName: "Live account",
          onBudget: true,
        },
        {
          entityId: "deleted-account",
          accountName: "Deleted account",
          onBudget: true,
          isTombstone: true,
        },
      ],
      masterCategories: [],
      payees: [
        { entityId: "live-payee", name: "Live payee" },
        {
          entityId: "deleted-payee",
          name: "Deleted payee",
          isTombstone: true,
        },
      ],
      transactions: [],
      scheduledTransactions: [],
      monthlyBudgets: [],
    },
    new Date("2026-07-20T00:00:00.000Z"),
  );

  assert.deepEqual(
    plan.accounts.map((account) => account.name),
    ["Live account"],
  );
  assert.deepEqual(
    plan.payees.map((payee) => payee.name),
    ["Live payee"],
  );
});

test("rejects duplicate source identities before mapping", () => {
  assert.throws(
    () =>
      buildYnab4LauncherImportPlan(
        createBudget(),
        {
          accounts: [
            { entityId: "duplicate-id", accountName: "Checking" },
          ],
          masterCategories: [],
          payees: [{ entityId: "duplicate-id", name: "Shop" }],
          transactions: [],
          scheduledTransactions: [],
          monthlyBudgets: [],
        },
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    /Duplicate YNAB4 source ID "duplicate-id"/,
  );
});

test("rejects invalid scheduled transaction references and required fields", () => {
  const baseData = {
    accounts: [
      {
        entityId: "source-checking",
        accountName: "Checking",
        onBudget: true,
      },
    ],
    masterCategories: [
      {
        entityId: "group-1",
        name: "Everyday",
        type: "OUTFLOW",
        subCategories: [
          { entityId: "source-groceries", name: "Groceries" },
        ],
      },
    ],
    payees: [],
    transactions: [],
    monthlyBudgets: [],
  };

  assert.throws(
    () =>
      buildYnab4LauncherImportPlan(
        createBudget(),
        {
          ...baseData,
          scheduledTransactions: [
            {
              entityId: "scheduled-missing-account",
              accountId: "unknown-account",
              nextDueDate: "2026-08-01",
              amount: -10,
              categoryId: "source-groceries",
            },
          ],
        },
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    /Unresolved YNAB4 account "unknown-account"/,
  );

  assert.throws(
    () =>
      buildYnab4LauncherImportPlan(
        createBudget(),
        {
          ...baseData,
          scheduledTransactions: [
            {
              entityId: "scheduled-missing-date",
              accountId: "source-checking",
              amount: -10,
              categoryId: "source-groceries",
            },
          ],
        },
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    /Invalid or missing YNAB4 date/,
  );
});
