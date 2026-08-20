import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionCsvImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

const mapping = {
  0: "date",
  1: "payee",
  2: "outflow",
} as const;

test("Montmorency automatically matches while unrelated same-amount Belong rows are hidden", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,COM*MONTMORENCY SC MONTMORENCY,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "montmorency",
        date: "2026-08-17",
        payee: "Montmorency Secondary College",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "belong-13",
        date: "2026-08-13",
        payee: "Belong",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "belong-11",
        date: "2026-08-11",
        payee: "Belong",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);

  const candidate = preview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.status, "exact-match");
  assert.equal(candidate.matchedTransactionId, "montmorency");

  assert.deepEqual(
    candidate.matchCandidates?.map((entry) => entry.transaction.id),
    ["montmorency"],
  );
});

test("one shared merchant token does not auto-match a different display payee without trusted merchant knowledge", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,RACV MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "racv",
        date: "2026-08-17",
        payee: "RACV Car Insurance",
        outflow: 1211.76,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map(
      (entry) => entry.transaction.id,
    ),
    ["racv"],
  );
});

test("same amount and exact date alone do not justify an automatic match", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,MONTMORENCY SECONDARY COLLEGE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "belong",
        date: "2026-08-17",
        payee: "Belong",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);
  assert.deepEqual(preview.candidates[0]?.matchCandidates, []);
});

test("RACV posted-date shift auto-matches when amount is exact and merchant identity remains strong", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,RACV MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "racv-authorised",
        date: "2026-08-14",
        payee: "RACV MELBOURNE 036",
        outflow: 1211.76,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(preview.candidates[0]?.matchedTransactionId, "racv-authorised");
});

test("VICROADS posted-date shift auto-matches despite trailing bank-detail change", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,VICROADS ONLINE PAYMEN KEW,963.40",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "vicroads-authorised",
        date: "2026-08-14",
        payee: "VICROADS ONLINE PAYMEN KEW 036",
        outflow: 963.4,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "vicroads-authorised",
  );
});

test("Northern Motor Group posted-date shift auto-matches when merchant and amount remain stable", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,NORTHERN MOTOR GROUP BUNDOORA,761.04",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "northern-authorised",
        date: "2026-08-14",
        payee: "NORTHERN MOTOR GROUP BUNDOORA",
        outflow: 761.04,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "northern-authorised",
  );
});

test("date proximity and exact amount still do not override a contradictory merchant", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,RACV MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "unrelated",
        date: "2026-08-14",
        payee: "Completely Different Merchant",
        outflow: 1211.76,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);
  assert.deepEqual(preview.candidates[0]?.matchCandidates, []);
});

test("shared location token does not auto-match distinct merchants on the same date and amount", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,MONTMORENCY CAFE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "montmorency-school",
        date: "2026-08-17",
        payee: "Montmorency Secondary College",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);
});
