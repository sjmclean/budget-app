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

function createEntries(transactions: unknown[]): Ynab4PackageEntry[] {
  const source = {
    accounts: [
      { entityId: "checking", accountName: "Checking", accountType: "Checking", onBudget: true },
      { entityId: "savings", accountName: "Savings", accountType: "Savings", onBudget: true },
    ],
    masterCategories: [],
    payees: [
      { entityId: "to-savings", name: "Transfer: Savings", targetAccountId: "savings" },
      { entityId: "to-checking", name: "Transfer: Checking", targetAccountId: "checking" },
    ],
    monthlyBudgets: [],
    transactions,
    scheduledTransactions: [],
  };
  return [
    { path: "Transfers.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
    { path: "Transfers.ynab4/data/Budget.yfull", text: JSON.stringify(source) },
  ];
}

function importEntries(entries: Ynab4PackageEntry[]) {
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
  return { storage, result };
}

const validTransactions = [
  {
    entityId: "transfer-out",
    accountId: "checking",
    targetAccountId: "savings",
    transferTransactionId: "transfer-in",
    payeeId: "to-savings",
    date: "2020-01-10",
    amount: -125,
  },
  {
    entityId: "transfer-in",
    accountId: "savings",
    targetAccountId: "checking",
    transferTransactionId: "transfer-out",
    payeeId: "to-checking",
    date: "2020-01-10",
    amount: 125,
  },
];

const { storage, result } = importEntries(createEntries(validTransactions));
assert.equal(result.record.accuracyAudit?.status, "pass");

const registersRaw = storage.getItem(
  getBudgetScopedStorageKey(result.budget.id, "budget-app.account-registers.v1"),
);
assert.ok(registersRaw);
const registers = JSON.parse(registersRaw) as Record<string, {
  accountId: string;
  transactions: Array<{
    id: string;
    inflow: number;
    outflow: number;
    transferId?: string;
    transferAccountId?: string;
    transferTransactionId?: string;
  }>;
}>;
const imported = Object.values(registers).flatMap((register) => register.transactions);
const outgoing = imported.find((transaction) => transaction.id === "transfer-out");
const incoming = imported.find((transaction) => transaction.id === "transfer-in");
assert.ok(outgoing);
assert.ok(incoming);
assert.equal(outgoing.transferTransactionId, incoming.id);
assert.equal(incoming.transferTransactionId, outgoing.id);
assert.equal(outgoing.transferId, incoming.transferId);
assert.ok(outgoing.transferId?.startsWith("ynab4-transfer-"));
assert.equal(outgoing.outflow, incoming.inflow);
assert.notEqual(outgoing.transferAccountId, incoming.transferAccountId);

const brokenCases = [
  {
    label: "missing pair",
    transactions: [{ ...validTransactions[0], transferTransactionId: "missing" }],
    message: /transfer pair missing was not found/i,
  },
  {
    label: "non-reciprocal pair",
    transactions: [validTransactions[0], { ...validTransactions[1], transferTransactionId: "other" }],
    message: /does not link back reciprocally/i,
  },
  {
    label: "amount mismatch",
    transactions: [validTransactions[0], { ...validTransactions[1], amount: 100 }],
    message: /not equal and opposite/i,
  },
  {
    label: "account mismatch",
    transactions: [validTransactions[0], { ...validTransactions[1], targetAccountId: "savings" }],
    message: /account relationship does not match/i,
  },
  {
    label: "date mismatch",
    transactions: [validTransactions[0], { ...validTransactions[1], date: "2020-01-11" }],
    message: /pair dates do not match/i,
  },
];

for (const broken of brokenCases) {
  assert.throws(
    () => importEntries(createEntries(broken.transactions)),
    broken.message,
    broken.label,
  );
}

console.log("v3.14.5 YNAB4 transfer integrity verification passed");
