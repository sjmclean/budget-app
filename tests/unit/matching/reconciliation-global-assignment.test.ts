import assert from "node:assert/strict";
import test from "node:test";

import { previewTransactionCsvImport } from "../../../apps/web/src/features/accounts/transactionImport.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

test("multi-row reconciliation does not let greedy source order create a duplicate import", () => {
  const preview = previewTransactionCsvImport(
    [
      "Date,Payee,Outflow",
      "2026-01-08,Coffee Shop,20.00",
      "2026-01-01,Coffee Shop,20.00",
    ].join("\n"),
    [
      buildRegisterTransaction({
        id: "existing-jan-07",
        date: "2026-01-07",
        payee: "Coffee Shop",
        outflow: 20,
      }),
      buildRegisterTransaction({
        id: "existing-jan-14",
        date: "2026-01-14",
        payee: "Coffee Shop",
        outflow: 20,
      }),
    ],
    {
      0: "date",
      1: "payee",
      2: "outflow",
    },
  );

  assert.equal(
    preview.summary.exactMatches,
    2,
    "both imported rows have a valid one-to-one same-merchant, same-amount match within the seven-day window",
  );

  assert.equal(
    preview.summary.newTransactions,
    0,
    "source-row order must not leave a matchable row classified as new and create a duplicate financial effect",
  );

  assert.deepEqual(
    preview.candidates.map((candidate) => candidate.matchedTransactionId),
    ["existing-jan-14", "existing-jan-07"],
    "the assignment should preserve both valid matches rather than greedily consuming the closest row needed by the later candidate",
  );
});

test("global assignment never reuses one register transaction for two imported rows", () => {
  const preview = previewTransactionCsvImport(
    [
      "Date,Payee,Outflow",
      "2026-01-08,Coffee Shop,20.00",
      "2026-01-09,Coffee Shop,20.00",
    ].join("\n"),
    [
      buildRegisterTransaction({
        id: "only-existing",
        date: "2026-01-08",
        payee: "Coffee Shop",
        outflow: 20,
      }),
    ],
    {
      0: "date",
      1: "payee",
      2: "outflow",
    },
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(preview.summary.newTransactions, 1);

  assert.equal(
    preview.candidates.filter(
      (candidate) => candidate.matchedTransactionId === "only-existing",
    ).length,
    1,
    "one register transaction must be consumed by at most one imported row",
  );
});
