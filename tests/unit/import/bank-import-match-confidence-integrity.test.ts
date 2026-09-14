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

test("APPLE.COM/BILL can manually see a same-date iTunes transaction", () => {
  const preview = previewTransactionCsvImport(
    ["Date,Payee,Outflow", "2026-08-17,APPLE.COM/BILL,14.99"].join("\n"),
    [buildRegisterTransaction({
      id: "itunes",
      date: "2026-08-17",
      payee: "itunes",
      outflow: 14.99,
    })],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.doesNotMatch(preview.candidates[0]?.reason ?? "", /no compatible merchant/i);
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["itunes"],
  );
  assert.equal(preview.candidates[0]?.matchCandidates?.[0]?.automaticMatch, false);
});

test("all low-similarity exact-amount transactions inside seven days remain manual options", () => {
  const preview = previewTransactionCsvImport(
    ["Date,Payee,Outflow", "2026-08-17,APPLE.COM/BILL,14.99"].join("\n"),
    [
      buildRegisterTransaction({ id: "same-day", date: "2026-08-17", payee: "itunes", outflow: 14.99 }),
      buildRegisterTransaction({ id: "three-days", date: "2026-08-14", payee: "Streaming", outflow: 14.99 }),
      buildRegisterTransaction({ id: "seven-days", date: "2026-08-10", payee: "Media Store", outflow: 14.99 }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["same-day", "three-days", "seven-days"],
  );
  assert.ok(preview.candidates[0]?.matchCandidates?.every((entry) => !entry.automaticMatch));
});

test("manual candidates still exclude different amounts and dates beyond seven days", () => {
  const preview = previewTransactionCsvImport(
    ["Date,Payee,Outflow", "2026-08-17,APPLE.COM/BILL,14.99"].join("\n"),
    [
      buildRegisterTransaction({ id: "eligible", date: "2026-08-13", payee: "itunes", outflow: 14.99 }),
      buildRegisterTransaction({ id: "different-amount", date: "2026-08-17", payee: "itunes", outflow: 15 }),
      buildRegisterTransaction({ id: "eight-days", date: "2026-08-09", payee: "itunes", outflow: 14.99 }),
    ],
    mapping,
  );

  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["eligible"],
  );
});

test("Montmorency automatically matches while unrelated same-amount rows remain manual options", () => {
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
    ["montmorency", "belong-13", "belong-11"],
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

test("same amount and exact date alone allow manual review without automatic matching", () => {
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
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["belong"],
  );
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
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["unrelated"],
  );
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

test("recurring same-merchant same-amount transactions remain ambiguous when the two best dates are too close", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,BELONG,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "belong-same-day",
        date: "2026-08-17",
        payee: "Belong",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "belong-one-day",
        date: "2026-08-16",
        payee: "Belong",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "belong-six-days",
        date: "2026-08-11",
        payee: "Belong",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);

  const candidates = preview.candidates[0]?.matchCandidates ?? [];
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0]?.transaction.id, "belong-same-day");
  assert.equal(candidates[0]?.amountCompetitionCount, 3);
  assert.ok(
    (candidates[0]?.matchScore ?? 0) >
      (candidates[1]?.matchScore ?? 0),
  );
});

test("a materially closer same-merchant candidate wins when it clears the confidence margin", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,BELONG,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "belong-same-day",
        date: "2026-08-17",
        payee: "Belong",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "belong-six-days",
        date: "2026-08-11",
        payee: "Belong",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "belong-same-day",
  );
});

test("same-amount transactions outside the match window still contribute local competition context", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,RACV MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "racv-match",
        date: "2026-08-17",
        payee: "RACV MELBOURNE",
        outflow: 1211.76,
      }),
      buildRegisterTransaction({
        id: "outside-candidate-window",
        date: "2026-08-28",
        payee: "Different Merchant",
        outflow: 1211.76,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);

  const candidates = preview.candidates[0]?.matchCandidates ?? [];
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.transaction.id, "racv-match");
  assert.equal(candidates[0]?.amountCompetitionCount, 2);
});

test("local amount uniqueness cannot override contradictory merchant evidence", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,RACV MELBOURNE,963.40",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "unrelated-rare-amount",
        date: "2026-08-17",
        payee: "Harvey Norman",
        outflow: 963.4,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["unrelated-rare-amount"],
  );
});

test("a review-only merchant candidate cannot veto a strong automatic match", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,MONTMORENCY SECONDARY COLLEGE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "school",
        date: "2026-08-17",
        payee: "Montmorency Secondary College",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "review-only",
        date: "2026-08-17",
        payee: "Montmorency Cafe",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "school",
  );

  const candidates = preview.candidates[0]?.matchCandidates ?? [];
  assert.equal(candidates[0]?.transaction.id, "school");

  const reviewOnly = candidates.find(
    (candidate) => candidate.transaction.id === "review-only",
  );
  assert.ok(reviewOnly);
  assert.equal(reviewOnly.merchantMatches, false);
});
