import assert from "node:assert/strict";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  discoverYnab4PackageStreaming,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.js";

const data = {
  accounts: [{ entityId: "card", name: "Card", accountType: "CreditCard" }],
  masterCategories: [{
    entityId: "group",
    name: "Living",
    note: "group note",
    subCategories: [{ entityId: "food", name: "Food", note: "category note" }],
  }],
  payees: [{ entityId: "shop", name: "Shop" }],
  monthlyBudgets: [{ month: "2026-07" }],
  transactions: Array.from({ length: 23 }, (_, index) => ({
    entityId: `tx-${index}`,
    accountId: "card",
    categoryId: "food",
    date: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
    amount: -index,
  })),
  scheduledTransactions: [{ entityId: "scheduled", accountId: "card", amount: -10 }],
};
const metadata = JSON.stringify({ relativeDataFolderName: "data1" });
const text = JSON.stringify(data);
const legacyEntries: Ynab4PackageEntry[] = [
  { path: "Family.ynab4/Budget.ymeta", text: metadata },
  { path: "Family.ynab4/data1/Budget.yfull", text },
];
const streamingEntries: Ynab4PackageEntry[] = [
  { path: "Family.ynab4/Budget.ymeta", text: metadata },
  { path: "Family.ynab4/data1/Budget.yfull", file: new Blob([text]) },
];
const legacy = discoverYnab4Package(legacyEntries);
const progress: number[] = [];
const streamed = await discoverYnab4PackageStreaming(streamingEntries, {
  batchSize: 3,
  onProgress: (count) => progress.push(count),
});
assert.deepEqual(streamed.counts, legacy.counts);
assert.deepEqual(streamed.details, legacy.details);
assert.deepEqual(streamed.topLevelKeys, legacy.topLevelKeys);
assert.equal(streamed.containsCreditCards, true);
assert.equal(streamingEntries[1].text, undefined);
assert.equal(streamingEntries[1].parsedData, undefined);
assert.equal(progress.at(-1), 23);
assert.equal(createYnab4PackageMigrationPreview(streamed, "new-budget").canContinue, true);

console.log("YNAB4 streaming preview equivalence tests passed");
