import assert from "node:assert/strict";
import {
  prepareYnab4PackageEntries,
  readYnab4BudgetData,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/package/readBudget.js";
import { auditYnab4MigrationCorrectness } from "../packages/ynab4-importer/src/auditYnab4MigrationCorrectness.js";
import { auditYnab4ImportedCategoryHierarchy } from "../packages/ynab4-importer/src/auditYnab4ImportedCategoryHierarchy.js";

const metadata = JSON.stringify({ relativeDataFolderName: "data1~" });
const budget = JSON.stringify({
  accounts: [{ entityId: "account-1", accountName: "Everyday" }],
  transactions: Array.from({ length: 1_000 }, (_, index) => ({
    entityId: `transaction-${index}`,
    amount: index,
  })),
});

let metadataReads = 0;
let activeBudgetReads = 0;
let staleBudgetReads = 0;

function trackedBlob(text: string, onRead: () => void): Blob {
  const blob = new Blob([text]);
  return Object.assign(blob, {
    async text() {
      onRead();
      return text;
    },
  });
}

const entries: Ynab4PackageEntry[] = [
  {
    path: "Household.ynab4/Budget.ymeta",
    file: trackedBlob(metadata, () => metadataReads += 1),
  },
  {
    path: "Household.ynab4/data1~/active/Budget.yfull",
    file: trackedBlob(budget, () => activeBudgetReads += 1),
    lastModified: 20,
  },
  {
    path: "Household.ynab4/data1~/stale/Budget.yfull",
    file: trackedBlob(budget, () => staleBudgetReads += 1),
    lastModified: 10,
  },
];

await prepareYnab4PackageEntries(entries);
assert.equal(metadataReads, 1, "Budget.ymeta should be read exactly once");
assert.equal(activeBudgetReads, 1, "only the newest active budget should be materialised");
assert.equal(staleBudgetReads, 0, "historical Budget.yfull files must stay lazy");

const first = readYnab4BudgetData(entries);
assert.equal(first.data?.transactions instanceof Array, true);
const activeEntry = entries[1];
assert.equal(activeEntry.text, undefined, "large source text must be released after parsing");
assert.ok(activeEntry.parsedData, "parsed data should be cached for reuse");

const second = readYnab4BudgetData(entries);
assert.strictEqual(second.data, first.data, "subsequent analysis must reuse one parsed object graph");
assert.equal(activeBudgetReads, 1, "the active budget must not be read repeatedly");

const correctnessAudit = auditYnab4MigrationCorrectness(entries);
assert.equal(correctnessAudit.summary.accounts, 1, "correctness audit must consume cached parsed data after source text release");
assert.equal(correctnessAudit.summary.transactions, 1_000, "correctness audit must retain transaction visibility after source text release");

const backup = JSON.stringify({ schema: "budget-app.budget-backup.v1", records: [] });
const hierarchyAudit = auditYnab4ImportedCategoryHierarchy(entries, backup);
assert.equal(hierarchyAudit.summary.sourceCategoryGroups, 0, "hierarchy audit must consume cached parsed data after source text release");
assert.equal(activeBudgetReads, 1, "audits must not reload the active budget file");

console.log("v527 YNAB4 large-file memory tests passed");
