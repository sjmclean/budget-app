import { readSeededTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import assert from "node:assert/strict";
import {
  createYnab4LauncherBudgetImport,
} from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.ts";
import { readTransactionTags } from "../apps/web/src/features/tags/transactionTagPersistence.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
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
    listKeys: () => [...values.keys()],
  };
}

const entries: Ynab4PackageEntry[] = [
  {
    path: "Flags.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Flags.ynab4/data1/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ accountId: "checking", name: "Checking" }],
      masterCategories: [],
      payees: [],
      monthlyBudgets: [],
      scheduledTransactions: [],
      transactions: [
        { entityId: "red-1", accountId: "checking", date: "2026-07-01", amount: -1000, flag: "red" },
        { entityId: "red-2", accountId: "checking", date: "2026-07-02", amount: -2000, flagColor: " Red " },
        { entityId: "blue-1", accountId: "checking", date: "2026-07-03", amount: -3000, flag: "blue" },
        { entityId: "unknown", accountId: "checking", date: "2026-07-04", amount: -4000, flag: "custom" },
      ],
    }),
  },
];

const discovery = discoverYnab4Package(entries);
const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
const storage = createMemoryStorage();
const result = createYnab4LauncherBudgetImport(storage, {
  discovery,
  preview,
  entries,
  now: new Date("2026-07-13T00:00:00.000Z"),
});

const scopedStorage = createFixedBudgetScopedStorage(storage, result.budget.id);
const tags = readTransactionTags(scopedStorage);
assert.deepEqual(
  tags.map((tag: { id: string }) => tag.id),
  ["ynab4-imported-flag-red", "ynab4-imported-flag-blue"],
  "one reusable tag should be created for each supported imported flag colour",
);
assert.equal(tags[0].name, "Red flag");
assert.equal(tags[0].colour, "red");
assert.equal(tags[0].autoTagImportedTransactions, false);

const registers = readSeededTransactionRegisters(scopedStorage);
const transactions = registers.checking.transactions;
const byId = new Map(transactions.map((transaction: any) => [transaction.id, transaction]));
assert.deepEqual(byId.get("red-1")?.tagIds, ["ynab4-imported-flag-red"]);
assert.deepEqual(byId.get("red-2")?.tagIds, ["ynab4-imported-flag-red"]);
assert.deepEqual(byId.get("blue-1")?.tagIds, ["ynab4-imported-flag-blue"]);
assert.deepEqual(byId.get("unknown")?.tagIds, []);
assert.equal(
  "flag" in (byId.get("red-1") ?? {}),
  false,
  "legacy register flags should be removed from imported transactions",
);

console.log("v2.93.5 YNAB4 flags-to-tags import checks passed");
