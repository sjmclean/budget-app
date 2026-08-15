import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionCsvImport,
  previewTransactionOfxImport,
  previewTransactionQifImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  allowRetainedSourceRecoveryForIdentity,
  createImportedTransactionIdentityEvidence,
  partitionCandidatesByImportedIdentity,
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
    identityCandidate({
      fitId: "FIT-100",
      name: "ORIGINAL BANK NAME",
      memo: "Original memo",
    }),
  );
  const repeated = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({
      fitId: "FIT-100",
      name: "CHANGED BANK NAME",
      memo: "Changed memo",
    }),
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

  const evidence = createImportedTransactionIdentityEvidence(
    "csv",
    candidate,
  );
  assert.equal(
    evidence.kind,
    "external",
    "the production CSV parser must retain the deliberately recognised transaction-ID header",
  );
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


function buildOverlapRegisterRows() {
  return Array.from({ length: 5 }, (_, index) => {
    const amount = index + 1;
    return buildRegisterTransaction({
      id: `represented-${amount}`,
      date: "2026-08-01",
      rawPayee: `SHOP ${amount}`,
      payee: `Shop ${amount}`,
      memo: `Reference ${amount}`,
      outflow: amount,
      inflow: 0,
    });
  });
}

test("overlapping QIF keeps exactly five represented rows out and two new monetary rows in", () => {
  const existingTransactions = buildOverlapRegisterRows();
  const records = Array.from({ length: 7 }, (_, index) => {
    const amount = index + 1;
    return [
      "D01/08/26",
      `T-${amount}.00`,
      `PSHOP ${amount}`,
      `MReference ${amount}`,
      "^",
    ].join("\n");
  });
  const incoming = previewTransactionQifImport(
    ["!Type:Bank", ...records].join("\n"),
    existingTransactions,
    { dateFormat: "DD/MM/YY" },
  );
  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(prepared.alreadyRepresentedCount, 5);
  assert.equal(prepared.reviewCandidates.length, 2);
  assert.deepEqual(
    prepared.reviewCandidates.map((candidate) => candidate.lifecycle.source.outflow),
    [6, 7],
  );
  assert.equal(
    prepared.reviewCandidates.reduce(
      (total, candidate) => total + candidate.lifecycle.source.outflow,
      0,
    ),
    13,
  );
});

test("overlapping CSV fallback is row-order independent and preserves the two new rows", () => {
  const existingTransactions = buildOverlapRegisterRows();
  const rows = [5, 3, 7, 1, 6, 4, 2].map(
    (amount) =>
      `2026-08-01,SHOP ${amount},${amount}.00,Reference ${amount}`,
  );
  const incoming = previewTransactionCsvImport(
    ["Date,Payee,Outflow,Memo", ...rows].join("\n"),
    existingTransactions,
    {
      0: "date",
      1: "payee",
      2: "outflow",
      3: "memo",
    },
  );
  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(prepared.alreadyRepresentedCount, 5);
  assert.equal(prepared.reviewCandidates.length, 2);
  assert.deepEqual(
    prepared.reviewCandidates
      .map((candidate) => candidate.lifecycle.source.outflow)
      .sort((left, right) => left - right),
    [6, 7],
  );
  assert.equal(
    prepared.reviewCandidates.reduce(
      (total, candidate) => total + candidate.lifecycle.source.outflow,
      0,
    ),
    13,
  );
});

test("blank OFX FITID uses fallback rather than fabricated strong identity", () => {
  const evidence = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({
      fitId: "   ",
      postedDate: "20260813",
      amount: "-20.00",
      name: "COFFEE SHOP",
    }),
  );

  assert.equal(evidence.kind, "fallback");
  assert.match(evidence.identity, /^ofx:fallback:/);
});


test("same strong FITID is suppressed occurrence-aware while a distinct FITID stays active", () => {
  const first = {
    ...identityCandidate({ fitId: "FIT-100" }),
    id: "first",
  };
  const repeated = {
    ...identityCandidate({ fitId: "FIT-100" }),
    id: "repeated",
  };
  const additionalOccurrence = {
    ...identityCandidate({ fitId: "FIT-100" }),
    id: "additional-occurrence",
  };
  const distinct = {
    ...identityCandidate({ fitId: "FIT-101" }),
    id: "distinct",
  };
  const firstIdentity = createImportedTransactionIdentityEvidence(
    "ofx",
    first,
  ).identity;

  const partition = partitionCandidatesByImportedIdentity({
    fileType: "ofx",
    candidates: [repeated, additionalOccurrence, distinct],
    importedCounts: new Map([[firstIdentity, 1]]),
  });

  assert.deepEqual(
    partition.previouslyImportedCandidates.map((candidate) => candidate.id),
    ["repeated"],
  );
  assert.deepEqual(
    partition.activeCandidates.map((candidate) => candidate.id),
    ["additional-occurrence", "distinct"],
  );
});


function externalFallbackAssociation(
  evidence: ReturnType<typeof createImportedTransactionIdentityEvidence>,
): string {
  const externalDigest = evidence.identity.split(":", 3)[2];
  const fallbackDigest = evidence.fallbackIdentity.split(":", 3)[2];
  assert.ok(externalDigest);
  assert.ok(fallbackDigest);
  return `ofx:external-fallback:${externalDigest}:${fallbackDigest}`;
}

test("unrelated strong OFX history does not disable YNAB4-style legacy retained recovery", () => {
  const unrelated = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({
      fitId: "ABC123",
      postedDate: "20260801",
      amount: "-25.00",
      name: "UNRELATED MERCHANT",
      memo: "Unrelated purchase",
    }),
  );
  const existingTransactions = [
    buildRegisterTransaction({
      id: "ynab4-migrated-racv",
      date: "2026-08-14",
      rawPayee: "RACV",
      payee: "RACV",
      memo: "Annual insurance",
      outflow: 1211.76,
      inflow: 0,
    }),
  ];
  const incoming = previewTransactionOfxImport([
    "<OFX>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260814<TRNAMT>-1211.76",
    "<FITID>XYZ789<NAME>RACV<MEMO>Annual insurance</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    "</OFX>",
  ].join(""), existingTransactions);
  const candidate = incoming.candidates[0];
  assert.ok(candidate);
  const incomingEvidence = createImportedTransactionIdentityEvidence(
    "ofx",
    candidate,
  );
  const unrelatedHistory = [
    { identity: unrelated.identity, occurrenceCount: 1 },
    {
      identity: externalFallbackAssociation(unrelated),
      occurrenceCount: 1,
    },
  ];
  const allowRecovery = allowRetainedSourceRecoveryForIdentity({
    evidence: incomingEvidence,
    importedFingerprints: unrelatedHistory,
  });
  assert.equal(allowRecovery, true);

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
        identity: incomingEvidence.identity,
        occurrenceCount: 0,
        kind: "external",
        allowRetainedSourceRecovery: allowRecovery,
      },
    },
  });

  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.reviewCandidates.length, 0);
  assert.equal(
    prepared.reviewCandidates.reduce(
      (total, item) => total + item.lifecycle.source.outflow,
      0,
    ),
    0,
    "the migrated RACV occurrence is represented once and is not duplicated",
  );
});

test("transaction-specific distinct strong OFX IDs cannot collapse through retained fields", () => {
  const knownA = createImportedTransactionIdentityEvidence(
    "ofx",
    identityCandidate({
      fitId: "FITID-A",
      postedDate: "20260814",
      amount: "-1211.76",
      name: "RACV",
      memo: "Annual insurance",
    }),
  );
  const existingTransactions = [
    buildRegisterTransaction({
      id: "represented-fitid-a",
      date: "2026-08-14",
      rawPayee: "RACV",
      payee: "RACV",
      memo: "Annual insurance",
      outflow: 1211.76,
      inflow: 0,
    }),
  ];
  const incoming = previewTransactionOfxImport([
    "<OFX>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260814<TRNAMT>-1211.76",
    "<FITID>FITID-B<NAME>RACV<MEMO>Annual insurance</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    "</OFX>",
  ].join(""), existingTransactions);
  const candidate = incoming.candidates[0];
  assert.ok(candidate);
  const incomingEvidence = createImportedTransactionIdentityEvidence(
    "ofx",
    candidate,
  );
  const knownHistory = [
    { identity: knownA.identity, occurrenceCount: 1 },
    {
      identity: externalFallbackAssociation(knownA),
      occurrenceCount: 1,
    },
  ];
  const allowRecovery = allowRetainedSourceRecoveryForIdentity({
    evidence: incomingEvidence,
    importedFingerprints: knownHistory,
  });
  assert.equal(allowRecovery, false);

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
        identity: incomingEvidence.identity,
        occurrenceCount: 0,
        kind: "external",
        allowRetainedSourceRecovery: allowRecovery,
      },
    },
  });

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(prepared.reviewCandidates.length, 1);
  assert.deepEqual(
    prepared.reviewCandidates.map((item) => ({
      payee: item.lifecycle.source.rawPayee,
      outflow: item.lifecycle.source.outflow,
    })),
    [{ payee: "RACV", outflow: 1211.76 }],
  );
});


function prepareMigratedOverlap(
  candidates: ReturnType<typeof previewTransactionQifImport>["candidates"],
  existingTransactions: ReturnType<typeof buildRegisterTransaction>[],
  sourceFileType: "qif" | "csv" = "qif",
) {
  return prepareTransactionImportPreview({
    partition: {
      activeCandidates: candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    sourceFileType,
  });
}

test("YNAB4 migrated provenance bridges edited and cleared memos occurrence-by-occurrence", () => {
  const existingTransactions = Array.from({ length: 25 }, (_, index) =>
    buildRegisterTransaction({
      id: `migrated-${index}`,
      date: "2026-08-01",
      rawPayee: `MERCHANT ${index}`,
      importProvenance: "ynab4-imported-payee",
      payee: `Merchant ${index}`,
      memo: index < 10 ? `Bank memo ${index}` : index % 2 ? undefined : "User edited",
      outflow: index + 1,
      inflow: 0,
    }),
  );
  const records = Array.from({ length: 25 }, (_, index) => [
    "D01/08/26",
    `T-${index + 1}.00`,
    `PMERCHANT ${index}`,
    `MBank memo ${index}`,
    "^",
  ].join("\n"));
  const incoming = previewTransactionQifImport(
    ["!Type:Bank", ...records].join("\n"),
    existingTransactions,
    { dateFormat: "DD/MM/YY" },
  );
  const prepared = prepareMigratedOverlap(incoming.candidates, existingTransactions);

  assert.equal(prepared.alreadyRepresentedCount, 25);
  assert.equal(prepared.reviewCandidates.length, 0);
  assert.equal(
    incoming.candidates.reduce((sum, candidate) => sum + candidate.lifecycle.source.outflow, 0),
    existingTransactions.reduce((sum, transaction) => sum + transaction.outflow, 0),
  );
});

test("YNAB4 migrated provenance bridges CSV without weakening manual or wrong raw-payee rows", () => {
  const migrated = buildRegisterTransaction({
    id: "migrated",
    date: "2026-08-05",
    rawPayee: "RACV",
    importProvenance: "ynab4-imported-payee",
    payee: "RACV",
    memo: "User changed memo",
    outflow: 99,
    inflow: 0,
  });
  const csv = ["Date,Payee,Outflow,Memo", "2026-08-05,RACV,99.00,Bank memo"].join("\n");
  const candidates = previewTransactionCsvImport(csv, [migrated], {
    0: "date", 1: "payee", 2: "outflow", 3: "memo",
  }).candidates;

  assert.equal(prepareMigratedOverlap(candidates, [migrated], "csv").alreadyRepresentedCount, 1);
  assert.equal(prepareMigratedOverlap(candidates, [{
    ...migrated, id: "manual", importProvenance: undefined,
  }], "csv").reviewCandidates.length, 1);
  assert.equal(prepareMigratedOverlap(candidates, [{
    ...migrated, id: "wrong", rawPayee: "DIFFERENT BANK TEXT",
  }], "csv").reviewCandidates.length, 1);
});

test("YNAB4 migrated provenance never consumes one register occurrence twice", () => {
  const migrated = buildRegisterTransaction({
    id: "one-migrated-occurrence",
    date: "2026-08-05",
    rawPayee: "RACV",
    importProvenance: "ynab4-imported-payee",
    payee: "RACV",
    memo: "Edited",
    outflow: 99,
    inflow: 0,
  });
  const records = Array.from({ length: 2 }, () => [
    "D05/08/26", "T-99.00", "PRACV", "MBank memo", "^",
  ].join("\n"));
  const incoming = previewTransactionQifImport(
    ["!Type:Bank", ...records].join("\n"),
    [migrated],
    { dateFormat: "DD/MM/YY" },
  );
  const prepared = prepareMigratedOverlap(incoming.candidates, [migrated]);

  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.reviewCandidates.length, 1);
});


test("YNAB4 migration bridge does not override native OFX strong identity", () => {
  const migrated = buildRegisterTransaction({
    id: "migrated-without-fitid",
    date: "2026-08-05",
    rawPayee: "RACV",
    importProvenance: "ynab4-imported-payee",
    payee: "RACV",
    memo: "User changed memo",
    outflow: 99,
    inflow: 0,
  });
  const incoming = previewTransactionOfxImport([
    "<OFX>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260805<TRNAMT>-99.00",
    "<FITID>FIT-NEW<NAME>RACV<MEMO>Original bank memo</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    "</OFX>",
  ].join(""), [migrated]);
  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions: [migrated],
    isExactDuplicateFile: false,
    sourceFileType: "ofx",
  });

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(prepared.reviewCandidates.length, 1);
});


function trustedBankRow(input: {
  id: string;
  date: string;
  rawPayee: string;
  outflow: number;
  provenance?: "ynab4-imported-payee" | "bank-import";
}) {
  return buildRegisterTransaction({
    id: input.id,
    date: input.date,
    rawPayee: input.rawPayee,
    importProvenance: input.provenance ?? "ynab4-imported-payee",
    payee: input.rawPayee,
    memo: "Register memo may differ",
    outflow: input.outflow,
    inflow: 0,
  });
}

function qifPreview(
  records: Array<{ date: string; payee: string; outflow: number; memo?: string }>,
  existingTransactions: ReturnType<typeof buildRegisterTransaction>[],
) {
  const qif = [
    "!Type:Bank",
    ...records.map((record) => [
      `D${record.date}`,
      `T-${record.outflow.toFixed(2)}`,
      `P${record.payee}`,
      `M${record.memo ?? "Bank memo"}`,
      "^",
    ].join("\n")),
  ].join("\n");
  return previewTransactionQifImport(qif, existingTransactions, {
    dateFormat: "DD/MM/YY",
  });
}

test("exact trusted bank provenance is consumed before settlement drift", () => {
  const existing = trustedBankRow({
    id: "exact-belong",
    date: "2026-08-05",
    rawPayee: "BELONG",
    outflow: 54.36,
  });
  const incoming = qifPreview([
    { date: "05/08/26", payee: "BELONG", outflow: 54.36, memo: "Cleared bank memo" },
  ], [existing]);
  const prepared = prepareMigratedOverlap(incoming.candidates, [existing]);

  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.reviewCandidates.length, 0);
  assert.ok(incoming.candidates[0]?.lifecycle.trace.some(
    (entry) => entry.source === "trusted-bank-provenance-exact-date",
  ));
  assert.equal(incoming.candidates[0]?.lifecycle.trace.some(
    (entry) => entry.source === "unique-settlement-bank-provenance",
  ), false);
});

test("unique QIF settlement drift of two and four days is represented", () => {
  const existing = [
    trustedBankRow({ id: "two-day", date: "2026-08-03", rawPayee: "BELONG", outflow: 54.36 }),
    trustedBankRow({ id: "four-day", date: "2026-08-01", rawPayee: "RACV", outflow: 99 }),
  ];
  const incoming = qifPreview([
    { date: "05/08/26", payee: "BELONG", outflow: 54.36 },
    { date: "05/08/26", payee: "RACV", outflow: 99 },
  ], existing);
  const prepared = prepareMigratedOverlap(incoming.candidates, existing);

  assert.equal(prepared.alreadyRepresentedCount, 2);
  assert.equal(prepared.reviewCandidates.length, 0);
});

test("exact occurrences are exhausted before a remaining drift occurrence", () => {
  const existing = [
    trustedBankRow({ id: "exact-first", date: "2026-08-05", rawPayee: "BELONG", outflow: 54.36 }),
    trustedBankRow({ id: "settled-later", date: "2026-08-07", rawPayee: "BELONG", outflow: 54.36 }),
  ];
  const incoming = qifPreview([
    { date: "05/08/26", payee: "BELONG", outflow: 54.36 },
    { date: "06/08/26", payee: "BELONG", outflow: 54.36 },
  ], existing);
  const prepared = prepareMigratedOverlap(incoming.candidates, existing);

  assert.equal(prepared.alreadyRepresentedCount, 2);
  assert.equal(prepared.reviewCandidates.length, 0);
});

test("equidistant settlement ambiguity remains in review", () => {
  const existing = [
    trustedBankRow({ id: "left", date: "2026-08-04", rawPayee: "BELONG", outflow: 54.36 }),
    trustedBankRow({ id: "right", date: "2026-08-06", rawPayee: "BELONG", outflow: 54.36 }),
  ];
  const incoming = qifPreview([
    { date: "05/08/26", payee: "BELONG", outflow: 54.36 },
  ], existing);
  const prepared = prepareMigratedOverlap(incoming.candidates, existing);

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("settlement assignment is independent of incoming candidate order", () => {
  const existing = [
    trustedBankRow({ id: "early", date: "2026-08-01", rawPayee: "BELONG", outflow: 54.36 }),
    trustedBankRow({ id: "late", date: "2026-08-05", rawPayee: "BELONG", outflow: 54.36 }),
  ];
  const records = [
    { date: "02/08/26", payee: "BELONG", outflow: 54.36 },
    { date: "04/08/26", payee: "BELONG", outflow: 54.36 },
  ];
  const forward = qifPreview(records, existing);
  const reverse = qifPreview([...records].reverse(), existing);

  assert.equal(prepareMigratedOverlap(forward.candidates, existing).alreadyRepresentedCount, 2);
  assert.equal(prepareMigratedOverlap(reverse.candidates, existing).alreadyRepresentedCount, 2);
});

test("settlement occurrence matching never consumes a register row twice", () => {
  const one = trustedBankRow({
    id: "single",
    date: "2026-08-01",
    rawPayee: "BELONG",
    outflow: 54.36,
  });
  const twoIncoming = qifPreview([
    { date: "02/08/26", payee: "BELONG", outflow: 54.36 },
    { date: "03/08/26", payee: "BELONG", outflow: 54.36 },
  ], [one]);
  const onePrepared = prepareMigratedOverlap(twoIncoming.candidates, [one]);
  assert.equal(onePrepared.alreadyRepresentedCount, 1);
  assert.equal(onePrepared.reviewCandidates.length, 1);

  const twoExisting = [
    one,
    trustedBankRow({ id: "second", date: "2026-08-10", rawPayee: "BELONG", outflow: 54.36 }),
  ];
  const uniquelyPairable = qifPreview([
    { date: "02/08/26", payee: "BELONG", outflow: 54.36 },
    { date: "09/08/26", payee: "BELONG", outflow: 54.36 },
  ], twoExisting);
  assert.equal(
    prepareMigratedOverlap(uniquelyPairable.candidates, twoExisting).alreadyRepresentedCount,
    2,
  );
});

test("settlement drift requires exact amount and exact raw bank payee", () => {
  const existing = trustedBankRow({
    id: "trusted",
    date: "2026-08-01",
    rawPayee: "BELONG",
    outflow: 54.36,
  });
  const wrongAmount = qifPreview([
    { date: "03/08/26", payee: "BELONG", outflow: 54.37 },
  ], [existing]);
  const wrongPayee = qifPreview([
    { date: "03/08/26", payee: "BELONG MOBILE", outflow: 54.36 },
  ], [existing]);

  assert.equal(prepareMigratedOverlap(wrongAmount.candidates, [existing]).reviewCandidates.length, 1);
  assert.equal(prepareMigratedOverlap(wrongPayee.candidates, [existing]).reviewCandidates.length, 1);
});

test("settlement drift never suppresses a manual row without trusted provenance", () => {
  const manual = {
    ...trustedBankRow({
      id: "manual",
      date: "2026-08-01",
      rawPayee: "BELONG",
      outflow: 54.36,
    }),
    importProvenance: undefined,
  };
  const incoming = qifPreview([
    { date: "03/08/26", payee: "BELONG", outflow: 54.36 },
  ], [manual]);

  assert.equal(prepareMigratedOverlap(incoming.candidates, [manual]).alreadyRepresentedCount, 0);
  assert.equal(prepareMigratedOverlap(incoming.candidates, [manual]).reviewCandidates.length, 1);
});

test("ordinary CSV can use unique settlement drift without a strong transaction ID", () => {
  const existing = trustedBankRow({
    id: "csv-settlement",
    date: "2026-08-03",
    rawPayee: "BELONG",
    outflow: 54.36,
    provenance: "bank-import",
  });
  const csv = ["Date,Payee,Outflow,Memo", "2026-08-05,BELONG,54.36,Bank memo"].join("\n");
  const incoming = previewTransactionCsvImport(csv, [existing], {
    0: "date", 1: "payee", 2: "outflow", 3: "memo",
  });
  const prepared = prepareMigratedOverlap(incoming.candidates, [existing], "csv");

  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.reviewCandidates.length, 0);
});

test("settlement drift outside the shared seven-day window remains in review", () => {
  const existing = trustedBankRow({
    id: "outside-window",
    date: "2026-08-01",
    rawPayee: "BELONG",
    outflow: 54.36,
  });
  const incoming = qifPreview([
    { date: "09/08/26", payee: "BELONG", outflow: 54.36 },
  ], [existing]);
  const prepared = prepareMigratedOverlap(incoming.candidates, [existing]);

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("OFX strong FITID remains authoritative across nearby posting dates", () => {
  const existing = trustedBankRow({
    id: "ofx-existing",
    date: "2026-08-03",
    rawPayee: "BELONG",
    outflow: 54.36,
  });
  const incoming = previewTransactionOfxImport([
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260805<TRNAMT>-54.36",
    "<FITID>DIFFERENT-FITID<NAME>BELONG<MEMO>Bank memo</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join(""), [existing]);
  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions: [existing],
    isExactDuplicateFile: false,
    sourceFileType: "ofx",
  });

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("real-world BELONG mix preserves exact, unique drift, and ambiguous review rows", () => {
  const existing = [
    trustedBankRow({ id: "exact", date: "2026-08-01", rawPayee: "BELONG", outflow: 50 }),
    trustedBankRow({ id: "plus-one", date: "2026-08-02", rawPayee: "BELONG", outflow: 51 }),
    trustedBankRow({ id: "plus-two", date: "2026-08-03", rawPayee: "BELONG", outflow: 52 }),
    trustedBankRow({ id: "plus-four", date: "2026-08-05", rawPayee: "BELONG", outflow: 53 }),
    trustedBankRow({ id: "ambiguous-left", date: "2026-08-04", rawPayee: "BELONG", outflow: 54 }),
    trustedBankRow({ id: "ambiguous-right", date: "2026-08-06", rawPayee: "BELONG", outflow: 54 }),
  ];
  const incoming = qifPreview([
    { date: "01/08/26", payee: "BELONG", outflow: 50 },
    { date: "01/08/26", payee: "BELONG", outflow: 51 },
    { date: "01/08/26", payee: "BELONG", outflow: 52 },
    { date: "01/08/26", payee: "BELONG", outflow: 53 },
    { date: "05/08/26", payee: "BELONG", outflow: 54 },
  ], existing);
  const prepared = prepareMigratedOverlap(incoming.candidates, existing);

  assert.equal(prepared.alreadyRepresentedCount, 4);
  assert.equal(prepared.reviewCandidates.length, 1);
  assert.deepEqual(
    prepared.reviewCandidates.map((candidate) => candidate.lifecycle.source.outflow),
    [54],
  );
});
