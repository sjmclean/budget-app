import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixture31 = new URL(
  "./fixtures/transaction-import/overlapping-qif/Transactions%20(31).qif",
  import.meta.url,
);
const fixture32 = new URL(
  "./fixtures/transaction-import/overlapping-qif/Transactions%20(32).qif",
  import.meta.url,
);
const testSource = await readFile(
  new URL("./v3218-overlapping-qif-regression.ts", import.meta.url),
  "utf8",
);
const source31 = await readFile(fixture31, "utf8");
const source32 = await readFile(fixture32, "utf8");

const countRecords = (source) => source.split(/\r?\n\^\r?\n?/).filter((record) => /\nD/.test(`\n${record}`)).length;
assert.equal(countRecords(source31), 41);
assert.equal(countRecords(source32), 46);
assert.match(testSource, /exactMatches, 41|exactMatches\), 41/);
assert.match(testSource, /newTransactions, 5|newTransactions\), 5/);
assert.match(testSource, /distinct register transaction/);
assert.match(testSource, /Aldi Duplicate/);

console.log("v3.21.8 overlapping QIF fixture structure checks passed");
