import assert from "node:assert/strict";
import {
  prepareYnab4PackageEntriesForStreaming,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.js";

let largeTextCalls = 0;
const largeBlob = new Blob(["{}"]);
Object.defineProperty(largeBlob, "text", {
  value: async () => {
    largeTextCalls += 1;
    throw new Error("Large Budget.yfull text() must not be called.");
  },
});
const entries: Ynab4PackageEntry[] = [
  {
    path: "Family.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Family.ynab4/data1/Budget.yfull",
    file: largeBlob,
    lastModified: 10,
  },
];

await prepareYnab4PackageEntriesForStreaming(entries);
assert.equal(largeTextCalls, 0);
assert.equal(entries[1].selectedBudgetData, true);
assert.equal(entries[1].text, undefined);
assert.equal(entries[1].parsedData, undefined);

console.log("YNAB4 lazy package-preparation test passed");
