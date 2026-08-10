import { readSeededTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import assert from "node:assert/strict";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { AccountRegisterView } from "../apps/web/src/features/accounts/accountRegisterTypes.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()].sort();
    },
  };
}

const entries: Ynab4PackageEntry[] = [
  {
    path: "My Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data33" }),
  },
  {
    path: "My Budget.ynab4/data33/DEVICE/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        { entityId: "acct-nab-offset", name: "NAB Offset", onBudget: true },
      ],
      payees: [
        { entityId: "payee-school", name: "School" },
        { entityId: "payee-coles", name: "Coles" },
        { entityId: "payee-bank", name: "Bank" },
      ],
      masterCategories: [
        {
          entityId: "group-main-expenses",
          name: "Main Expenses",
          subCategories: [
            { entityId: "cat-school", name: "School Fees/Education" },
            { entityId: "cat-groceries", name: "Groceries" },
            { entityId: "cat-bank-fees", name: "Bank Fees" },
          ],
        },
      ],
      transactions: [
        {
          entityId: "txn-whole-dollar-outflow",
          accountId: "acct-nab-offset",
          date: "2026-06-01",
          payeeId: "payee-school",
          categoryId: "cat-school",
          amount: -61,
        },
        {
          entityId: "txn-whole-dollar-inflow",
          accountId: "acct-nab-offset",
          date: "2026-06-02",
          payeeId: "payee-bank",
          categoryId: "cat-bank-fees",
          amount: 500,
        },
        {
          entityId: "txn-decimal-outflow",
          accountId: "acct-nab-offset",
          date: "2026-06-03",
          payeeId: "payee-coles",
          categoryId: "cat-groceries",
          amount: -12.34,
        },
        {
          entityId: "txn-milliunit-outflow",
          accountId: "acct-nab-offset",
          date: "2026-06-04",
          payeeId: "payee-bank",
          categoryId: "cat-bank-fees",
          amountMilliUnits: -25000,
        },
        {
          entityId: "txn-split-whole-dollar-lines",
          accountId: "acct-nab-offset",
          date: "2026-06-05",
          payeeId: "payee-coles",
          amount: -100,
          subTransactions: [
            { entityId: "split-school", categoryId: "cat-school", amount: -60 },
            { entityId: "split-groceries", categoryId: "cat-groceries", amount: -40 },
          ],
        },
      ],
      scheduledTransactions: [],
      monthlyBudgets: [],
    }),
  },
];

function importRegisters(): Record<string, AccountRegisterView> {
  const storage = createMemoryStorage();
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-24T06:00:00.000Z"),
  });
  return readSeededTransactionRegisters(createFixedBudgetScopedStorage(storage, result.budget.id));
}

function testRegisterAmountsAreNotDividedByOneThousand() {
  const registers = importRegisters();
  const register = registers["nab-offset"];
  assert.ok(register);

  const byId = new Map(register.transactions.map((transaction) => [transaction.id, transaction]));

  assert.equal(byId.get("txn-whole-dollar-outflow")?.outflow, 61);
  assert.equal(byId.get("txn-whole-dollar-inflow")?.inflow, 500);
  assert.equal(byId.get("txn-decimal-outflow")?.outflow, 12.34);
  assert.equal(byId.get("txn-milliunit-outflow")?.outflow, 25);
  assert.equal(byId.get("txn-split-whole-dollar-lines")?.outflow, 100);
}

function testSplitLineAmountsAreNotDividedByOneThousand() {
  const registers = importRegisters();
  const register = registers["nab-offset"];
  assert.ok(register);

  const split = register.transactions.find((transaction) => transaction.id === "txn-split-whole-dollar-lines");
  assert.ok(split);
  assert.equal(split.splitLines?.length, 2);
  assert.equal(split.splitLines?.[0]?.outflow, 60);
  assert.equal(split.splitLines?.[1]?.outflow, 40);
}

function testWorkingBalanceUsesDisplayUnitTransactionAmounts() {
  const registers = importRegisters();
  const register = registers["nab-offset"];
  assert.ok(register);

  assert.equal(Math.round(register.workingBalance * 100) / 100, 301.66);
  assert.equal(Math.round(register.clearedBalance * 100) / 100, 0);
  assert.equal(Math.round(register.unclearedBalance * 100) / 100, 301.66);
}

testRegisterAmountsAreNotDividedByOneThousand();
testSplitLineAmountsAreNotDividedByOneThousand();
testWorkingBalanceUsesDisplayUnitTransactionAmounts();

console.log("v1.78 YNAB4 register amount fidelity passed");
