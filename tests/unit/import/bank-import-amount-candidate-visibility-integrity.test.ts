import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionQifImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

test("Apple bank description offers unique same-date iTunes transaction for manual review", () => {
  const qif = [
    "!Type:CCard",
    "D26/08/26",
    "T-14.99",
    "PAPPLE.COM/BILL           SYDNEY       036",
    "MCard ending 4165",
    "^",
  ].join("\n");

  const preview = previewTransactionQifImport(
    qif,
    [
      buildRegisterTransaction({
        id: "itunes",
        date: "2026-08-26",
        payee: "itunes",
        outflow: 14.99,
      }),
    ],
    {
      dateFormat: "DD/MM/YY",
      amountFormat: "decimal-dot",
    },
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);

  const candidate = preview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.matchedTransactionId, undefined);

  assert.deepEqual(
    candidate.matchCandidates?.map((entry) => entry.transaction.id),
    ["itunes"],
  );

  assert.equal(candidate.matchCandidates?.[0]?.automaticMatch, false);
  assert.equal(candidate.matchCandidates?.[0]?.daysApart, 0);
  assert.equal(candidate.matchCandidates?.[0]?.amountCompetitionCount, 1);
});

test("unique same-amount transaction a few days away remains a manual option despite unrelated payee", () => {
  const qif = [
    "!Type:CCard",
    "D26/08/26",
    "T-14.99",
    "PAPPLE.COM/BILL           SYDNEY       036",
    "^",
  ].join("\n");

  const preview = previewTransactionQifImport(
    qif,
    [
      buildRegisterTransaction({
        id: "itunes",
        date: "2026-08-24",
        payee: "itunes",
        outflow: 14.99,
      }),
    ],
    {
      dateFormat: "DD/MM/YY",
      amountFormat: "decimal-dot",
    },
  );

  assert.deepEqual(
    preview.candidates[0]?.matchCandidates?.map(
      (entry) => entry.transaction.id,
    ),
    ["itunes"],
  );
  assert.equal(
    preview.candidates[0]?.matchCandidates?.[0]?.automaticMatch,
    false,
  );
});

test("different amount and rows outside the candidate window are still excluded", () => {
  const qif = [
    "!Type:CCard",
    "D26/08/26",
    "T-14.99",
    "PAPPLE.COM/BILL           SYDNEY       036",
    "^",
  ].join("\n");

  const preview = previewTransactionQifImport(
    qif,
    [
      buildRegisterTransaction({
        id: "wrong-amount",
        date: "2026-08-26",
        payee: "itunes",
        outflow: 15,
      }),
      buildRegisterTransaction({
        id: "outside-window",
        date: "2026-08-18",
        payee: "itunes",
        outflow: 14.99,
      }),
    ],
    {
      dateFormat: "DD/MM/YY",
      amountFormat: "decimal-dot",
    },
  );

  assert.deepEqual(preview.candidates[0]?.matchCandidates, []);
});
