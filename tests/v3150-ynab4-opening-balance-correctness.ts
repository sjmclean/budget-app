import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import { getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    listKeys: () => [...values.keys()].sort(),
  };
}

const source = {
  accounts: [
    {
      entityId: "snapshot-account",
      accountName: "Snapshot Account",
      accountType: "Checking",
      onBudget: true,
      balance: 1500,
      clearedBalance: 1400,
    },
    {
      entityId: "explicit-account",
      accountName: "Explicit Account",
      accountType: "Checking",
      onBudget: true,
      startingBalance: 250,
      balance: 1200,
      clearedBalance: 1100,
    },
    {
      entityId: "opening-account",
      accountName: "Opening Account",
      accountType: "Checking",
      onBudget: true,
      openingBalance: -75,
      balance: 500,
    },
  ],
  masterCategories: [],
  payees: [{ entityId: "payee", name: "Imported Payee" }],
  monthlyBudgets: [],
  transactions: [
    {
      entityId: "snapshot-txn",
      accountId: "snapshot-account",
      date: "2020-01-01",
      amount: 100,
      payeeId: "payee",
    },
    {
      entityId: "explicit-txn",
      accountId: "explicit-account",
      date: "2020-01-01",
      amount: -50,
      payeeId: "payee",
    },
  ],
  scheduledTransactions: [],
};

const entries: Ynab4PackageEntry[] = [
  { path: "Opening.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
  { path: "Opening.ynab4/data/Budget.yfull", text: JSON.stringify(source) },
];

const storage = createMemoryStorage();
const discovery = discoverYnab4Package(entries);
const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
assert.equal(preview.canContinue, true);
const result = createYnab4LauncherBudgetImport(storage, {
  discovery,
  preview,
  entries,
  now: new Date("2026-07-15T00:00:00.000Z"),
});

assert.equal(result.record.accuracyAudit?.status, "pass");

const accountsRaw = storage.getItem(
  getBudgetScopedStorageKey(result.budget.id, "budget-app.accounts.v1"),
);
assert.ok(accountsRaw);
const accounts = JSON.parse(accountsRaw) as Array<{
  name: string;
  startingBalance: number;
}>;

assert.equal(
  accounts.find((account) => account.name === "Snapshot Account")?.startingBalance,
  0,
  "Current balance snapshots must not be reused as opening balances when transaction history is imported.",
);
assert.equal(
  accounts.find((account) => account.name === "Explicit Account")?.startingBalance,
  250,
  "An explicit startingBalance field must be preserved.",
);
assert.equal(
  accounts.find((account) => account.name === "Opening Account")?.startingBalance,
  -75,
  "An explicit openingBalance field must be preserved.",
);

const registersRaw = storage.getItem(
  getBudgetScopedStorageKey(result.budget.id, "budget-app.account-registers.v1"),
);
assert.ok(registersRaw);
const registers = JSON.parse(registersRaw) as Record<string, { accountName: string; workingBalance: number }>;
assert.equal(
  Object.values(registers).find((register) => register.accountName === "Snapshot Account")?.workingBalance,
  100,
  "The imported register balance must come from transaction history, not from the source current-balance snapshot.",
);

console.log("v3.15.0 YNAB4 opening-balance correctness passed");
