import assert from "node:assert/strict";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4PackageStreaming,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.js";
import {
  createYnab4LauncherBudgetImportWithBackend,
  readYnab4LauncherImportRecord,
  selectYnab4StagedAuditTransactionIds,
} from "../apps/web/src/features/budget/ynab4LauncherImport.js";
import { readAccounts } from "../apps/web/src/features/accounts/accountService.js";
import { ACCOUNT_ENTITY_INDEX_KEY } from "../apps/web/src/features/accounts/entities/accountEntity.js";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.js";
import { BUDGET_MONTH_ENTITY_INDEX_KEY } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";
import { readBudgetLauncherStats } from "../apps/web/src/features/budget/budgetLauncherStats.js";
import { isLargeStreamingYnab4Budget } from "../apps/web/src/features/budget/ynab4/finaliseYnab4Import.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()]; }
  async flush() {}
}

const data = {
  currency: "AUD",
  accounts: [
    { entityId: "checking", name: "Checking", accountType: "Checking", onBudget: true },
  ],
  masterCategories: [{
    entityId: "living",
    name: "Living",
    type: "OUTFLOW",
    subCategories: [{ entityId: "food", name: "Food" }],
  }],
  payees: [{ entityId: "shop", name: "Shop" }],
  monthlyBudgets: [],
  transactions: Array.from({ length: 7 }, (_, index) => ({
    entityId: `transaction-${index}`,
    accountId: "checking",
    categoryId: "food",
    payeeId: "shop",
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    amount: -10 - index,
  })),
  scheduledTransactions: [],
};
const metadata = JSON.stringify({ relativeDataFolderName: "data1" });
const sourceBlob = new Blob([JSON.stringify(data)]);
const entries: Ynab4PackageEntry[] = [
  { path: "Production.ynab4/Budget.ymeta", file: new Blob([metadata]) },
  { path: "Production.ynab4/data1/Budget.yfull", file: sourceBlob },
];

const discovery = await discoverYnab4PackageStreaming(entries, { batchSize: 2 });
const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
const storage = new MemoryStorage();
const existingBudgetMonthId = "existing-budget:2026-06";
storage.setItem(
  BUDGET_MONTH_ENTITY_INDEX_KEY,
  JSON.stringify([existingBudgetMonthId]),
);
const phases: string[] = [];
const result = await createYnab4LauncherBudgetImportWithBackend(storage, {
  discovery,
  preview,
  entries,
  batchSize: 2,
  now: new Date("2026-07-28T00:00:00.000Z"),
  onProgress: (progress) => phases.push(progress.phase),
});

assert.equal(result.record.schemaVersion, 2);
assert.equal(result.record.streamingImport?.audit.status, "pass");
assert.equal(result.record.streamingImport?.audit.transactions, 7);
assert.equal(result.record.streamingImport?.maximumCanonicalBatchRecords, 2);
assert.equal(result.record.streamingImport?.persistedTransactions, 7);
assert.equal(result.record.accuracyAudit, undefined);
assert.match(result.record.accuracyAuditReport ?? "", /streaming staged audit: PASS/);
assert.equal(phases.at(-1), "committing");
assert.equal(
  storage.listKeys().some((key) => key.startsWith("budget-app.import-stage.")),
  false,
);
assert.equal(
  readYnab4LauncherImportRecord(storage, result.budget.id)?.schemaVersion,
  2,
);
assert.equal(entries[1]?.text, undefined);
assert.equal(entries[1]?.parsedData, undefined);
assert.deepEqual(
  readAccounts(createFixedBudgetScopedStorage(storage, result.budget.id))
    .map((account) => account.name),
  ["Checking"],
);
const scopedAccountStorage = createFixedBudgetScopedStorage(
  storage,
  result.budget.id,
);
scopedAccountStorage.removeItem(ACCOUNT_ENTITY_INDEX_KEY);
assert.deepEqual(
  readAccounts(scopedAccountStorage).map((account) => account.name),
  ["Checking"],
  "durable account records must remain discoverable when their derived index is missing",
);
const budgetMonthIds = JSON.parse(
  storage.getItem(BUDGET_MONTH_ENTITY_INDEX_KEY) ?? "[]",
) as string[];
assert.ok(
  budgetMonthIds.includes(existingBudgetMonthId),
  "the shared budget-month index must retain entries belonging to existing budgets",
);
assert.ok(
  budgetMonthIds.some((id) => id.startsWith(`${result.budget.id}:`)),
  "the shared budget-month index must include imported budget months",
);
let transactionRecordReads = 0;
const launcherStorage: KeyValueStoragePort = {
  getItem(key) {
    if (key.includes("entity-replication.v1/transaction/")) {
      transactionRecordReads += 1;
      throw new Error("Budget launcher must not decode transaction records.");
    }
    return storage.getItem(key);
  },
  setItem: (key, value) => storage.setItem(key, value),
  removeItem: (key) => storage.removeItem(key),
  listKeys: () => storage.listKeys(),
};
assert.deepEqual(readBudgetLauncherStats(launcherStorage, result.budget), {
  accountCount: 1,
  transactionCount: 7,
});
assert.equal(
  transactionRecordReads,
  0,
  "rendering the completed budget card must remain constant-memory",
);
assert.equal(isLargeStreamingYnab4Budget(storage, result.budget.id), false);
assert.equal(isLargeStreamingYnab4Budget(storage, result.budget.id, 6), true);
const largeAuditIds = Array.from(
  { length: 30_000 },
  (_, index) => `transaction-${index}`,
);
const selectedAuditIds = selectYnab4StagedAuditTransactionIds(largeAuditIds);
assert.equal(selectedAuditIds.length, 256);
assert.equal(selectedAuditIds[0], largeAuditIds[0]);
assert.equal(selectedAuditIds.at(-1), largeAuditIds.at(-1));

const cancelledStorage = new MemoryStorage();
const controller = new AbortController();
controller.abort();
await assert.rejects(
  createYnab4LauncherBudgetImportWithBackend(cancelledStorage, {
    discovery,
    preview,
    entries,
    signal: controller.signal,
  }),
  /abort/i,
);
assert.deepEqual(cancelledStorage.listKeys(), []);

console.log("YNAB4 production streaming cutover tests passed");
