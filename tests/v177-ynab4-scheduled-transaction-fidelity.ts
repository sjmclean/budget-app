import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.ts";
import { createScheduledTransactionEntityRepository, projectScheduledTransaction } from "../apps/web/src/features/accounts/entities/scheduledTransactionEntity.js";
import assert from "node:assert/strict";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { ScheduledTransactionView } from "../apps/web/src/features/accounts/scheduledTransactionService.ts";
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
        { entityId: "acct-cdia", name: "CDIA Account", onBudget: false },
        { entityId: "acct-home-loan", name: "NAB Homeloan", onBudget: false },
      ],
      payees: [
        { entityId: "payee-amelia", name: "Amelia" },
        { entityId: "payee-pocket-money", name: "Pocket Money" },
        { entityId: "payee-department", name: "Department Of Education" },
        { entityId: "payee-teachers-health", name: "Teachers Health Insurance" },
      ],
      masterCategories: [
        {
          entityId: "group-savings-goals",
          name: "Savings Goal",
          subCategories: [{ entityId: "cat-investments", name: "Investments" }],
        },
        {
          entityId: "group-monthly-bills",
          name: "Monthly Bills",
          subCategories: [
            { entityId: "cat-phone", name: "Phone & Mobile ($75p/m)" },
            { entityId: "cat-pocket-money", name: "Pocket Money" },
          ],
        },
        {
          entityId: "group-main-expenses",
          name: "Main Expenses",
          subCategories: [
            { entityId: "cat-mortgage", name: "Mortgage($955p/f)$878" },
            { entityId: "cat-income-a", name: "Income Allocation A" },
            { entityId: "cat-income-b", name: "Income Allocation B" },
          ],
        },
        {
          entityId: "group-annual-expenses",
          name: "Annual Expenses",
          subCategories: [{ entityId: "cat-health-insurance", name: "Health Insurance $235p/f" }],
        },
      ],
      transactions: [
        { entityId: "txn-preview", accountId: "acct-nab-offset", date: "2026-06-01", amount: 0 },
      ],
      scheduledTransactions: [
        {
          entityId: "sched-transfer-cdia",
          accountId: "acct-nab-offset",
          targetAccountId: "acct-cdia",
          date: "2026-06-29",
          frequency: "Every Other Week",
          payee: "Transfer: CDIA Account",
          categoryId: "cat-investments",
          amount: -10,
        },
        {
          entityId: "sched-amelia-phone",
          accountId: "acct-nab-offset",
          date: "2026-07-07",
          frequency: "Monthly",
          payeeId: "payee-amelia",
          categoryId: "cat-phone",
          amount: -25,
        },
        {
          entityId: "sched-mortgage",
          accountId: "acct-nab-offset",
          targetAccountId: "acct-home-loan",
          date: "2026-07-01",
          frequency: "Monthly",
          payee: "Transfer: NAB Homeloan",
          categoryId: "cat-mortgage",
          amount: -1886,
        },
        {
          entityId: "sched-pocket-money",
          accountId: "acct-nab-offset",
          date: "2026-07-02",
          frequency: "Every Other Week",
          payeeId: "payee-pocket-money",
          categoryId: "cat-pocket-money",
          amount: -10,
        },
        {
          entityId: "sched-department-income",
          accountId: "acct-nab-offset",
          date: "2026-07-07",
          frequency: "Every Other Week",
          payeeId: "payee-department",
          amount: 3621.05,
          subTransactions: [
            { entityId: "split-income-a", categoryId: "cat-income-a", amount: 2000 },
            { entityId: "split-income-b", categoryId: "cat-income-b", amount: 1621.05 },
          ],
        },
        {
          entityId: "sched-teachers-health",
          accountId: "acct-nab-offset",
          date: "2026-04-12",
          frequency: "Yearly",
          payeeId: "payee-teachers-health",
          categoryId: "cat-health-insurance",
          amount: -5700,
        },
      ],
      monthlyBudgets: [],
    }),
  },
];

function importScheduledTransactions(): ScheduledTransactionView[] {
  const storage = createMemoryStorage();
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-24T05:00:00.000Z"),
  });
  return createScheduledTransactionEntityRepository(
    createFixedBudgetScopedStorage(storage, result.budget.id),
  ).list().map(projectScheduledTransaction);
}

function byId(transactions: ScheduledTransactionView[], id: string): ScheduledTransactionView {
  const transaction = transactions.find((item) => item.id === id);
  assert.ok(transaction, `Expected scheduled transaction ${id}`);
  return transaction;
}

function testScheduledAmountsAreNotDividedByOneThousand() {
  const scheduled = importScheduledTransactions();

  assert.equal(byId(scheduled, "sched-transfer-cdia").outflow, 10);
  assert.equal(byId(scheduled, "sched-amelia-phone").outflow, 25);
  assert.equal(byId(scheduled, "sched-mortgage").outflow, 1886);
  assert.equal(byId(scheduled, "sched-pocket-money").outflow, 10);
  assert.equal(byId(scheduled, "sched-teachers-health").outflow, 5700);
}

function testScheduledSplitLinesArePreserved() {
  const scheduled = importScheduledTransactions();
  const department = byId(scheduled, "sched-department-income");

  assert.equal(department.inflow, 3621.05);
  assert.equal(department.category, "Split");
  assert.equal(department.splitLines?.length, 2);
  assert.equal(department.splitLines?.[0]?.category, "Income Allocation A");
  assert.equal(department.splitLines?.[0]?.inflow, 2000);
  assert.equal(department.splitLines?.[1]?.category, "Income Allocation B");
  assert.equal(department.splitLines?.[1]?.inflow, 1621.05);
}

function testScheduledTransferRecurrenceAndRegisterInputPreserveSplits() {
  const scheduled = importScheduledTransactions();
  const transfer = byId(scheduled, "sched-transfer-cdia");
  const department = byId(scheduled, "sched-department-income");

  assert.equal(transfer.frequency, "fortnightly");
  assert.equal(transfer.payee, "Transfer: CDIA Account");
  assert.equal(department.frequency, "fortnightly");
  assert.equal(department.splitLines?.map((line) => line.category).join(","), "Income Allocation A,Income Allocation B");
}

testScheduledAmountsAreNotDividedByOneThousand();
testScheduledSplitLinesArePreserved();
testScheduledTransferRecurrenceAndRegisterInputPreserveSplits();

console.log("v1.77 YNAB4 scheduled transaction fidelity passed");
