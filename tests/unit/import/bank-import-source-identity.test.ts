import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionCsvImport,
  previewTransactionOfxImport,
  previewTransactionQifImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  createImportedTransactionIdentityEvidence,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";
import {
  prepareTransactionImportPreview,
} from "../../../apps/web/src/features/accounts/transactionImportPreviewPreparation.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

function identityCandidate(raw: Readonly<Record<string, string>>) {
  return {
    id: "candidate",
    parsed: {
      date: "2026-08-13",
      payee: "COFFEE SHOP",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
      raw,
    },
  };
}

test("QIF always uses fallback identity even when raw data contains a generic unique ID", () => {
  const evidence = createImportedTransactionIdentityEvidence(
    "qif",
    identityCandidate({
      date: "13/08/26",
      payee: "COFFEE SHOP",
      amount: "-20.00",
      "unique id": "row-17",
    }),
  );

  assert.equal(evidence.kind, "fallback");
  assert.match(evidence.identity, /^qif:fallback:/);
});

test("CSV trusts only deliberately recognised bank transaction ID headers", () => {
  const strong = createImportedTransactionIdentityEvidence(
    "csv",
    identityCandidate({
      Date: "2026-08-13",
      Payee: "COFFEE SHOP",
      Amount: "-20.00",
      "Transaction ID": "bank-123",
    }),
  );
  const generic = createImportedTransactionIdentityEvidence(
    "csv",
    identityCandidate({
      Date: "2026-08-13",
      Payee: "COFFEE SHOP",
      Amount: "-20.00",
      ID: "row-17",
      "Unique ID": "export-row-17",
    }),
  );

  assert.equal(strong.kind, "external");
  assert.match(strong.identity, /^csv:external:/);
  assert.equal(generic.kind, "fallback");
  assert.match(generic.identity, /^csv:fallback:/);
});

test("OFX FITID is stable across files and distinct FITIDs remain distinct", () => {
  const first = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({ fitId: "FIT-100" }),
  );
  const repeated = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({ fitId: "FIT-100" }),
  );
  const different = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({ fitId: "FIT-101" }),
  );

  assert.equal(first.kind, "external");
  assert.equal(first.identity, repeated.identity);
  assert.notEqual(first.identity, different.identity);
});

test("identity remains format-qualified", () => {
  const csv = createImportedTransactionIdentityEvidence(
    "csv",
    identityCandidate({ "Transaction ID": "bank-123" }),
  );
  const ofx = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({ fitId: "bank-123" }),
  );

  assert.notEqual(csv.identity, ofx.identity);
  assert.match(csv.identity, /^csv:external:/);
  assert.match(ofx.identity, /^ofx:external:/);
});

test("different strong IDs with identical descriptive fields are not overlap-suppressed", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "represented-fitid-a",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP",
      payee: "Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
  ];
  const csv = [
    "Date,Payee,Outflow,Memo,Transaction ID",
    "2026-08-13,COFFEE SHOP,20.00,Card ending 1234,FITID-B",
  ].join("\n");
  const incoming = previewTransactionCsvImport(csv, existingTransactions, {
    0: "date",
    1: "payee",
    2: "outflow",
    3: "memo",
    4: "ignore",
  });
  const candidate = incoming.candidates[0];
  assert.ok(candidate);

  const evidence = createImportedTransactionIdentityEvidence("csv", {
    ...candidate,
    parsed: {
      ...candidate.parsed,
      raw: {
        ...candidate.parsed.raw,
        "Transaction ID": "FITID-B",
      },
    },
  });
  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: [candidate],
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    previouslyImportedSourceOccurrences: {
      [candidate.id]: {
        identity: evidence.identity,
        occurrenceCount: 0,
        kind: "external",
        allowRetainedSourceRecovery: false,
      },
    },
  });

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("strong incoming identity may recover a legacy retained row when no strong history exists", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "legacy-represented-row",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP",
      payee: "Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
  ];
  const csv = [
    "Date,Payee,Outflow,Memo",
    "2026-08-13,COFFEE SHOP,20.00,Card ending 1234",
  ].join("\n");
  const incoming = previewTransactionCsvImport(csv, existingTransactions, {
    0: "date",
    1: "payee",
    2: "outflow",
    3: "memo",
  });
  const candidate = incoming.candidates[0];
  assert.ok(candidate);

  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: [candidate],
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    previouslyImportedSourceOccurrences: {
      [candidate.id]: {
        identity: "csv:external:legacy-first-seen",
        occurrenceCount: 0,
        kind: "external",
        allowRetainedSourceRecovery: true,
      },
    },
  });

  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.reviewCandidates.length, 0);
});

test("production parsers expose QIF fallback and OFX FITID source evidence", () => {
  const qif = previewTransactionQifImport([
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCOFFEE SHOP",
    "^",
  ].join("\n"), []);
  const ofx = previewTransactionOfxImport([
    "<OFX>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260813<TRNAMT>-20.00",
    "<FITID>FIT-100<NAME>COFFEE SHOP</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    "</OFX>",
  ].join(""), []);

  const qifCandidate = qif.candidates[0];
  const ofxCandidate = ofx.candidates[0];
  assert.ok(qifCandidate);
  assert.ok(ofxCandidate);
  assert.equal(
    createImportedTransactionIdentityEvidence("qif", qifCandidate).kind,
    "fallback",
  );
  assert.equal(
    createImportedTransactionIdentityEvidence("ofx", ofxCandidate).kind,
    "external",
  );
});
