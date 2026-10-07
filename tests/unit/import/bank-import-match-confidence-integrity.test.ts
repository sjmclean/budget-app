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

test("APPLE.COM/BILL can manually see a same-date Example Media transaction", () => {
  const preview = previewTransactionCsvImport(
    ["Date,Payee,Outflow", "2026-08-17,APPLE.COM/BILL,14.99"].join("\n"),
    [buildRegisterTransaction({
      id: "example media",
      date: "2026-08-17",
      payee: "example media",
      outflow: 14.99,
    })],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.doesNotMatch(preview.candidates[0]?.reason ?? "", /no compatible merchant/i);
  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["example media"],
  );
  assert.equal(preview.candidates[0]?.matchCandidates?.[0]?.automaticMatch, false);
});

test("all low-similarity exact-amount transactions inside seven days remain manual options", () => {
  const preview = previewTransactionCsvImport(
    ["Date,Payee,Outflow", "2026-08-17,APPLE.COM/BILL,14.99"].join("\n"),
    [
      buildRegisterTransaction({ id: "same-day", date: "2026-08-17", payee: "example media", outflow: 14.99 }),
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
      buildRegisterTransaction({ id: "eligible", date: "2026-08-13", payee: "example media", outflow: 14.99 }),
      buildRegisterTransaction({ id: "different-amount", date: "2026-08-17", payee: "example media", outflow: 15 }),
      buildRegisterTransaction({ id: "eight-days", date: "2026-08-09", payee: "example media", outflow: 14.99 }),
    ],
    mapping,
  );

  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map((entry) => entry.transaction.id),
    ["eligible"],
  );
});

test("Example Secondary College automatically matches while unrelated same-amount rows remain manual options", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE SECONDARY COLLEGE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "example-school",
        date: "2026-08-17",
        payee: "Example Local Secondary College",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "telecom-13",
        date: "2026-08-13",
        payee: "Example Telecom",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "telecom-11",
        date: "2026-08-11",
        payee: "Example Telecom",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);

  const candidate = preview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.status, "exact-match");
  assert.equal(candidate.matchedTransactionId, "example-school");

  assert.deepEqual(
    candidate.matchCandidates?.map((entry) => entry.transaction.id),
    ["example-school", "telecom-13", "telecom-11"],
  );
});

test("one shared merchant token does not auto-match a different display payee without trusted merchant knowledge", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE SERVICES MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "example-insurance",
        date: "2026-08-17",
        payee: "Example Car Insurance",
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
    ["example-insurance"],
  );
});

test("same amount and exact date alone allow manual review without automatic matching", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE SECONDARY COLLEGE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "belong",
        date: "2026-08-17",
        payee: "Example Telecom",
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

test("Example Insurance posted-date shift auto-matches when amount is exact and merchant identity remains strong", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE INSURANCE MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "insurance-authorised",
        date: "2026-08-14",
        payee: "EXAMPLE INSURANCE MELBOURNE 036",
        outflow: 1211.76,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(preview.candidates[0]?.matchedTransactionId, "insurance-authorised");
});

test("Example Registration Office posted-date shift auto-matches despite trailing bank-detail change", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE REGISTRATION OFFICE ONLINE,963.40",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "registration-authorised",
        date: "2026-08-14",
        payee: "EXAMPLE REGISTRATION OFFICE ONLINE 036",
        outflow: 963.4,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "registration-authorised",
  );
});

test("Example Auto Dealer posted-date shift auto-matches when merchant and amount remain stable", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE AUTO DEALER NORTH,761.04",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "dealer-authorised",
        date: "2026-08-14",
        payee: "EXAMPLE AUTO DEALER NORTH",
        outflow: 761.04,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "dealer-authorised",
  );
});

test("date proximity and exact amount still do not override a contradictory merchant", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE INSURANCE MELBOURNE,1211.76",
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
    "2026-08-17,EXAMPLE LOCAL CAFE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "example-school",
        date: "2026-08-17",
        payee: "Example Secondary College",
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
    "2026-08-17,EXAMPLE TELECOM,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "telecom-same-day",
        date: "2026-08-17",
        payee: "Example Telecom",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "telecom-one-day",
        date: "2026-08-16",
        payee: "Example Telecom",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "telecom-six-days",
        date: "2026-08-11",
        payee: "Example Telecom",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);

  const candidates = preview.candidates[0]?.matchCandidates ?? [];
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0]?.transaction.id, "telecom-same-day");
  assert.equal(candidates[0]?.amountCompetitionCount, 3);
  assert.ok(
    (candidates[0]?.matchScore ?? 0) >
      (candidates[1]?.matchScore ?? 0),
  );
});

test("a materially closer same-merchant candidate wins when it clears the confidence margin", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE TELECOM,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "telecom-same-day",
        date: "2026-08-17",
        payee: "Example Telecom",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "telecom-six-days",
        date: "2026-08-11",
        payee: "Example Telecom",
        outflow: 25,
      }),
    ],
    mapping,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "telecom-same-day",
  );
});

test("same-amount transactions outside the match window still contribute local competition context", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE INSURANCE MELBOURNE,1211.76",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "insurance-match",
        date: "2026-08-17",
        payee: "EXAMPLE INSURANCE MELBOURNE",
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
  assert.equal(candidates[0]?.transaction.id, "insurance-match");
  assert.equal(candidates[0]?.amountCompetitionCount, 2);
});

test("local amount uniqueness cannot override contradictory merchant evidence", () => {
  const csv = [
    "Date,Payee,Outflow",
    "2026-08-17,EXAMPLE INSURANCE MELBOURNE,963.40",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "unrelated-rare-amount",
        date: "2026-08-17",
        payee: "Example Electronics",
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
    "2026-08-17,EXAMPLE SECONDARY COLLEGE,25.00",
  ].join("\n");

  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "school",
        date: "2026-08-17",
        payee: "Example Secondary College",
        outflow: 25,
      }),
      buildRegisterTransaction({
        id: "review-only",
        date: "2026-08-17",
        payee: "Example Local Cafe",
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
