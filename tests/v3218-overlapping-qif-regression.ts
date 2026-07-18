import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import {
  parseTransactionQif,
  previewTransactionQifImport,
} from "../apps/web/src/features/accounts/transactionImport";

const fixtureDirectory = new URL(
  "./fixtures/transaction-import/overlapping-qif/",
  import.meta.url,
);
const format = {
  dateFormat: "DD/MM/YYYY" as const,
  amountFormat: "decimal-dot" as const,
};

async function readFixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(name, fixtureDirectory)), "utf8");
}

function toRegisterTransaction(
  transaction: ReturnType<typeof parseTransactionQif>[number],
  index: number,
): RegisterTransactionView {
  return {
    id: `fixture-register-${index + 1}`,
    date: transaction.date,
    payee: transaction.payee,
    category: transaction.importedCategoryName ?? "Uncategorised",
    memo: transaction.memo,
    inflow: transaction.inflow,
    outflow: transaction.outflow,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
    attachmentCount: 0,
  };
}

const file31 = await readFixture("Transactions (31).qif");
const file32 = await readFixture("Transactions (32).qif");
const parsed31 = parseTransactionQif(file31, format);
const parsed32 = parseTransactionQif(file32, format);

assert.equal(parsed31.length, 41, "the baseline fixture must contain 41 rows");
assert.equal(parsed32.length, 46, "the overlapping fixture must contain 46 rows");
assert.deepEqual(
  parsed31.filter((transaction) => transaction.payee === "Aldi Duplicate").length,
  2,
  "the baseline fixture must retain repeated identical occurrences",
);

const initialPreview = previewTransactionQifImport(file31, [], format);
assert.deepEqual(initialPreview.summary, {
  totalRows: 41,
  newTransactions: 41,
  exactMatches: 0,
  possibleMatches: 0,
  invalidRows: 0,
  selectedForImport: 41,
});

const existingTransactions = parsed31.map(toRegisterTransaction);
const overlappingPreview = previewTransactionQifImport(
  file32,
  existingTransactions,
  format,
);

assert.equal(overlappingPreview.summary.totalRows, 46);
assert.equal(overlappingPreview.summary.exactMatches, 41);
assert.equal(overlappingPreview.summary.newTransactions, 5);
assert.equal(overlappingPreview.summary.invalidRows, 0);
assert.equal(overlappingPreview.summary.selectedForImport, 5);

const exactMatches = overlappingPreview.candidates.filter(
  (candidate) => candidate.status === "exact-match",
);
assert.equal(exactMatches.length, 41);
assert.equal(
  new Set(exactMatches.map((candidate) => candidate.matchedTransactionId)).size,
  41,
  "each overlapping row must consume a distinct register transaction",
);
assert.equal(
  exactMatches.filter(
    (candidate) => candidate.lifecycle.source.rawPayee === "Aldi Duplicate",
  ).length,
  2,
  "identical repeated purchases must both reconcile one-for-one",
);

assert.deepEqual(
  overlappingPreview.candidates
    .filter((candidate) => candidate.status === "new")
    .map((candidate) => candidate.lifecycle.source.rawPayee),
  [
    "New Merchant A",
    "New Merchant B",
    "Salary Adjustment",
    "New Merchant C",
    "New Merchant D",
  ],
);

console.log("v3.21.8 overlapping QIF behavioural regression checks passed");
