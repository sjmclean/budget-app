import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionCsvImport,
  previewTransactionQifImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  prepareTransactionImportPreview,
} from "../../../apps/web/src/features/accounts/transactionImportPreviewPreparation.js";
import { mapYnab4Transactions } from "../../../apps/web/src/features/budget/ynab4/mapYnab4Transactions.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

function partition(
  candidates: ReturnType<typeof previewTransactionQifImport>["candidates"],
) {
  return {
    activeCandidates: candidates,
    previouslyImportedCandidates: [],
    alreadyRepresentedCandidates: [],
  };
}

const singleQif = [
  "!Type:Bank",
  "D13/08/26",
  "T-71.59",
  "PEXAMPLE MEMBERSHIP ASSOCIATION MELBOURNE",
  "MCard ending 5934",
  "^",
].join("\n");

test("overlapping QIF row already represented by retained bank source fields is excluded from review", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "previous-bank-import",
      date: "2026-08-13",
      rawPayee: "EXAMPLE MEMBERSHIP ASSOCIATION MELBOURNE",
      payee: "Renamed Membership Payee",
      memo: "Card ending 5934",
      outflow: 71.59,
      inflow: 0,
    }),
  ];

  const incoming = previewTransactionQifImport(
    singleQif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(
    prepared.reviewCandidates.length,
    0,
    "a row whose retained bank source fields are already represented must not require user processing",
  );
  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.totalExistingCount, 1);
});

test("manual register transaction without retained raw bank payee is not silently excluded", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "manual-entry",
      date: "2026-08-13",
      payee: "EXAMPLE MEMBERSHIP ASSOCIATION MELBOURNE",
      rawPayee: undefined,
      memo: "Card ending 5934",
      outflow: 71.59,
      inflow: 0,
    }),
  ];

  const incoming = previewTransactionQifImport(
    singleQif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(
    prepared.alreadyRepresentedCount,
    0,
    "ordinary manual transactions must remain in the normal matching workflow",
  );
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("overlapping QIF suppression consumes retained bank transactions occurrence for occurrence", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "previous-bank-import-1",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP MELBOURNE",
      payee: "Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
    buildRegisterTransaction({
      id: "previous-bank-import-2",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP MELBOURNE",
      payee: "Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const qif = [
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCOFFEE SHOP MELBOURNE",
    "MCard ending 1234",
    "^",
    "D13/08/26",
    "T-20.00",
    "PCOFFEE SHOP MELBOURNE",
    "MCard ending 1234",
    "^",
    "D13/08/26",
    "T-20.00",
    "PCOFFEE SHOP MELBOURNE",
    "MCard ending 1234",
    "^",
  ].join("\n");

  const incoming = previewTransactionQifImport(
    qif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(
    prepared.alreadyRepresentedCount,
    2,
    "only the number of matching retained bank occurrences already in the register may be excluded",
  );
  assert.equal(
    prepared.reviewCandidates.length,
    1,
    "an additional genuinely repeated bank transaction must remain available for processing",
  );
});

test("different retained bank memo prevents cross-file overlap suppression", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "previous-bank-import",
      date: "2026-08-13",
      rawPayee: "EXAMPLE MEMBERSHIP ASSOCIATION MELBOURNE",
      payee: "Renamed Membership Payee",
      memo: "Different card/reference",
      outflow: 71.59,
      inflow: 0,
    }),
  ];

  const incoming = previewTransactionQifImport(
    singleQif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(
    prepared.reviewCandidates.length,
    1,
    "different bank-source memo/reference data must keep the row in the review workflow",
  );
});

test("overlapping CSV row already represented by retained bank source fields is excluded from review", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "previous-csv-bank-import",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP MELBOURNE",
      payee: "Favourite Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const csv = [
    "Date,Payee,Outflow,Memo",
    "2026-08-13,COFFEE SHOP MELBOURNE,20.00,Card ending 1234",
  ].join("\n");

  const incoming = previewTransactionCsvImport(
    csv,
    existingTransactions,
    {
      0: "date",
      1: "payee",
      2: "outflow",
      3: "memo",
    },
  );

  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(prepared.reviewCandidates.length, 0);
  assert.equal(prepared.alreadyRepresentedCount, 1);
});

test("overlapping CSV occurrence counting preserves an additional genuine identical transaction", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "previous-csv-bank-import-1",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP MELBOURNE",
      payee: "Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
    buildRegisterTransaction({
      id: "previous-csv-bank-import-2",
      date: "2026-08-13",
      rawPayee: "COFFEE SHOP MELBOURNE",
      payee: "Coffee Shop",
      memo: "Card ending 1234",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const csv = [
    "Date,Payee,Outflow,Memo",
    "2026-08-13,COFFEE SHOP MELBOURNE,20.00,Card ending 1234",
    "2026-08-13,COFFEE SHOP MELBOURNE,20.00,Card ending 1234",
    "2026-08-13,COFFEE SHOP MELBOURNE,20.00,Card ending 1234",
  ].join("\n");

  const incoming = previewTransactionCsvImport(
    csv,
    existingTransactions,
    {
      0: "date",
      1: "payee",
      2: "outflow",
      3: "memo",
    },
  );

  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(prepared.alreadyRepresentedCount, 2);
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("previously processed bank row is excluded after matching a manual transaction with a different user memo", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "previous-manual-match",
      date: "2026-08-13",
      rawPayee: "CAFE MELBOURNE TERMINAL 04",
      payee: "My Friendly Cafe",
      memo: "User-entered memo",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const qif = [
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCAFE MELBOURNE TERMINAL 04",
    "MCard ending 5934",
    "^",
  ].join("\n");

  const incoming = previewTransactionQifImport(
    qif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    previouslyImportedSourceOccurrences: Object.fromEntries(
      incoming.candidates.map((candidate) => [
        candidate.id,
        {
          identity: [
            candidate.lifecycle.source.date,
            candidate.lifecycle.source.rawPayee,
            candidate.lifecycle.source.inflow,
            candidate.lifecycle.source.outflow,
            candidate.lifecycle.source.memo ?? "",
          ].join("|"),
          occurrenceCount: 1,
        },
      ]),
    ),
  });

  assert.equal(
    prepared.reviewCandidates.length,
    0,
    "an exact previously processed bank source row should not return for review merely because the user's memo differs",
  );
  assert.equal(prepared.alreadyRepresentedCount, 1);
});

test("prior source evidence cannot suppress a row without a retained register bank occurrence", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "manual-only",
      date: "2026-08-13",
      rawPayee: undefined,
      payee: "My Friendly Cafe",
      memo: "User-entered memo",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const qif = [
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCAFE MELBOURNE TERMINAL 04",
    "MCard ending 5934",
    "^",
  ].join("\n");

  const incoming = previewTransactionQifImport(
    qif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    previouslyImportedSourceOccurrences: Object.fromEntries(
      incoming.candidates.map((candidate) => [
        candidate.id,
        {
          identity: [
            candidate.lifecycle.source.date,
            candidate.lifecycle.source.rawPayee,
            candidate.lifecycle.source.inflow,
            candidate.lifecycle.source.outflow,
            candidate.lifecycle.source.memo ?? "",
          ].join("|"),
          occurrenceCount: 1,
        },
      ]),
    ),
  });

  assert.equal(prepared.alreadyRepresentedCount, 0);
  assert.equal(
    prepared.reviewCandidates.length,
    1,
    "fingerprint history alone must never silently suppress a transaction",
  );
});

test("prior source occurrence counts cannot suppress more register occurrences than were previously processed", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "represented-1",
      date: "2026-08-13",
      rawPayee: "CAFE MELBOURNE TERMINAL 04",
      payee: "My Friendly Cafe",
      memo: "User memo one",
      outflow: 20,
      inflow: 0,
    }),
    buildRegisterTransaction({
      id: "represented-2",
      date: "2026-08-13",
      rawPayee: "CAFE MELBOURNE TERMINAL 04",
      payee: "My Friendly Cafe",
      memo: "User memo two",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const qif = [
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCAFE MELBOURNE TERMINAL 04",
    "MCard ending 5934",
    "^",
    "D13/08/26",
    "T-20.00",
    "PCAFE MELBOURNE TERMINAL 04",
    "MCard ending 5934",
    "^",
  ].join("\n");

  const incoming = previewTransactionQifImport(
    qif,
    existingTransactions,
  );

  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    previouslyImportedSourceOccurrences: Object.fromEntries(
      incoming.candidates.map((candidate) => [
        candidate.id,
        {
          identity: [
            candidate.lifecycle.source.date,
            candidate.lifecycle.source.rawPayee,
            candidate.lifecycle.source.inflow,
            candidate.lifecycle.source.outflow,
            candidate.lifecycle.source.memo ?? "",
          ].join("|"),
          occurrenceCount: 1,
        },
      ]),
    ),
  });

  assert.equal(
    prepared.alreadyRepresentedCount,
    1,
    "only the proven number of previous source occurrences may be excluded",
  );
  assert.equal(prepared.reviewCandidates.length, 1);
});

test("one register occurrence cannot be consumed once by historical fallback and again by exact memo matching", () => {
  const existingTransactions = [
    buildRegisterTransaction({
      id: "single-represented-occurrence",
      date: "2026-08-13",
      rawPayee: "CAFE MELBOURNE TERMINAL 04",
      payee: "My Friendly Cafe",
      memo: "User memo",
      outflow: 20,
      inflow: 0,
    }),
  ];

  const qif = [
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCAFE MELBOURNE TERMINAL 04",
    "MBank memo",
    "^",
    "D13/08/26",
    "T-20.00",
    "PCAFE MELBOURNE TERMINAL 04",
    "MUser memo",
    "^",
  ].join("\n");

  const incoming = previewTransactionQifImport(
    qif,
    existingTransactions,
  );

  const [historicalCandidate, exactMemoCandidate] = incoming.candidates;

  assert.ok(historicalCandidate);
  assert.ok(exactMemoCandidate);

  const historicalIdentity = [
    historicalCandidate.lifecycle.source.date,
    historicalCandidate.lifecycle.source.rawPayee,
    historicalCandidate.lifecycle.source.inflow,
    historicalCandidate.lifecycle.source.outflow,
    historicalCandidate.lifecycle.source.memo ?? "",
  ].join("|");

  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions,
    isExactDuplicateFile: false,
    previouslyImportedSourceOccurrences: {
      [historicalCandidate.id]: {
        identity: historicalIdentity,
        occurrenceCount: 1,
      },
      [exactMemoCandidate.id]: {
        identity: [
          exactMemoCandidate.lifecycle.source.date,
          exactMemoCandidate.lifecycle.source.rawPayee,
          exactMemoCandidate.lifecycle.source.inflow,
          exactMemoCandidate.lifecycle.source.outflow,
          exactMemoCandidate.lifecycle.source.memo ?? "",
        ].join("|"),
        occurrenceCount: 0,
      },
    },
  });

  assert.equal(
    prepared.alreadyRepresentedCount,
    1,
    "one retained register transaction may represent at most one incoming occurrence",
  );
  assert.equal(
    prepared.reviewCandidates.length,
    1,
    "the second incoming row must remain available for processing",
  );
});


test("YNAB4-migrated imported payee provenance participates in occurrence-aware overlap recovery", () => {
  const registers = mapYnab4Transactions({
    accounts: [{
      id: "checking",
      name: "Checking",
      type: "on-budget" as const,
      startingBalance: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    maps: {
      accountIdBySourceId: new Map([["source-checking", "checking"]]),
      accountNameById: new Map([["checking", "Checking"]]),
      accountTypeById: new Map([["checking", "on-budget" as const]]),
      categoryIdBySourceId: new Map(),
      categoryNameById: new Map(),
      payeeIdBySourceId: new Map([["source-shop", "shop"]]),
      payeeNameById: new Map([["shop", "Coffee Shop"]]),
    },
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [{
      entityId: "ynab4-historical-import",
      accountId: "source-checking",
      date: "2026-08-13",
      amount: -20,
      payeeId: "source-shop",
      source: "Imported",
      importedPayee: "COFFEE SHOP MELBOURNE",
      memo: "Card ending 1234",
    }],
  });
  const existingTransactions = registers.checking.transactions;
  assert.equal(existingTransactions[0]?.payee, "Coffee Shop");
  assert.equal(existingTransactions[0]?.rawPayee, "COFFEE SHOP MELBOURNE");

  const qif = [
    "!Type:Bank",
    "D13/08/26",
    "T-20.00",
    "PCOFFEE SHOP MELBOURNE",
    "MCard ending 1234",
    "^",
    "D13/08/26",
    "T-20.00",
    "PCOFFEE SHOP MELBOURNE",
    "MCard ending 1234",
    "^",
  ].join("\n");
  const incoming = previewTransactionQifImport(qif, existingTransactions);
  const prepared = prepareTransactionImportPreview({
    partition: partition(incoming.candidates),
    existingTransactions,
    isExactDuplicateFile: false,
  });

  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(
    prepared.reviewCandidates.length,
    1,
    "one migrated occurrence may suppress only one incoming occurrence",
  );
});
