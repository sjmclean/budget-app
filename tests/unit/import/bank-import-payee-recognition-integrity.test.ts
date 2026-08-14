import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionCsvImport,
  type TransactionImportMerchantResolver,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import { resolvePayeeRecognition } from "../../../apps/web/src/features/accounts/payeeRecognition.js";
import type { PayeeView } from "../../../apps/web/src/features/accounts/payeeService.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

const payees: PayeeView[] = [
  {
    id: "payee-association",
    name: "Example Membership Association",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-08-01T00:00:00.000Z",
    useCount: 10,
    defaultCategoryId: "category-union-fees",
    defaultCategoryName: "Union Fees",
    importRules: [
      {
        id: "rule-association",
        matchType: "contains",
        text: "Example Membership Association",
        defaultCategoryId: "category-union-fees",
        defaultCategoryName: "Union Fees",
        priority: 100,
        enabled: true,
      },
    ],
    aliases: [],
  },
];

const resolveMerchant: TransactionImportMerchantResolver = (rawPayee) => {
  const recognition = resolvePayeeRecognition(rawPayee, payees);

  if (!recognition.match) return undefined;

  const { payee, rule, source } = recognition.match;

  return {
    canonicalPayee: payee.name,
    canonicalPayeeId: payee.id,
    suggestedCategoryName:
      rule?.defaultCategoryName ?? payee.defaultCategoryName ?? null,
    transferAccountName: null,
    recognitionProvenance:
      source === "rule" ? "explicit-rule" : "exact-alias",
    recognitionReason:
      source === "rule"
        ? `Explicit ${rule?.matchType ?? "payee"} recognition rule`
        : "Exact learned alias or canonical payee",
  };
};

const csv = [
  "Date,Payee,Outflow",
  "2026-08-14,DIRECT DEBIT 123456 EXAMPLE MEMBERSHIP ASSOCIATION,37.50",
].join("\n");

const mapping = {
  0: "date",
  1: "payee",
  2: "outflow",
} as const;

test("explicit recognition rule canonicalises a noisy bank description and proposes its category", () => {
  const preview = previewTransactionCsvImport(
    csv,
    [],
    mapping,
    resolveMerchant,
  );

  assert.equal(preview.candidates.length, 1);

  const candidate = preview.candidates[0];
  assert.ok(candidate);

  assert.equal(
    candidate.lifecycle.merchant?.canonicalPayee,
    "Example Membership Association",
  );
  assert.equal(
    candidate.lifecycle.merchant?.suggestedCategoryName,
    "Union Fees",
  );

  assert.equal(
    candidate.lifecycle.proposal.payee,
    "Example Membership Association",
  );
  assert.equal(
    candidate.lifecycle.proposal.categoryName,
    "Union Fees",
  );
});

test("recognized bank row automatically matches one unique manual transaction", () => {
  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "manual-association",
        date: "2026-08-14",
        payee: "Example Membership Association",
        payeeId: "payee-association",
        outflow: 37.5,
      }),
    ],
    mapping,
    resolveMerchant,
  );

  assert.equal(preview.summary.exactMatches, 1);
  assert.equal(preview.summary.newTransactions, 0);

  const candidate = preview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.status, "exact-match");
  assert.equal(candidate.matchedTransactionId, "manual-association");
});

test("recognized bank row does not automatically choose between two equally plausible manual transactions", () => {
  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "manual-a",
        date: "2026-08-14",
        payee: "Example Membership Association",
        payeeId: "payee-association",
        outflow: 37.5,
      }),
      buildRegisterTransaction({
        id: "manual-b",
        date: "2026-08-14",
        payee: "Example Membership Association",
        payeeId: "payee-association",
        outflow: 37.5,
      }),
    ],
    mapping,
    resolveMerchant,
  );

  assert.equal(preview.summary.exactMatches, 0);
  assert.equal(preview.summary.newTransactions, 1);

  const candidate = preview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.status, "new");
  assert.equal(candidate.matchedTransactionId, undefined);

  assert.deepEqual(
    candidate.matchCandidates?.map(
      (assessment) => assessment.transaction.id,
    ),
    ["manual-a", "manual-b"],
  );
});

test("equally ranked recognition rules remain ambiguous rather than selecting a payee arbitrarily", () => {
  const conflictingPayees: PayeeView[] = [
    ...payees,
    {
      id: "payee-other",
      name: "Other Union",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: "2026-08-01T00:00:00.000Z",
      useCount: 1,
      importRules: [
        {
          id: "rule-other",
          matchType: "contains",
          text: "Example Membership Association",
          priority: 100,
          enabled: true,
        },
      ],
      aliases: [],
    },
  ];

  const recognition = resolvePayeeRecognition(
    "DIRECT DEBIT 123456 EXAMPLE MEMBERSHIP ASSOCIATION",
    conflictingPayees,
  );

  assert.equal(recognition.match, null);
  assert.deepEqual(
    recognition.ambiguous.map((entry) => entry.payee.id).sort(),
    ["payee-association", "payee-other"],
  );
});

test("explicit recognition uses stable payee identity when the manual transaction display name differs", () => {
  const preview = previewTransactionCsvImport(
    csv,
    [
      buildRegisterTransaction({
        id: "manual-association-renamed",
        date: "2026-08-14",
        payee: "Association Membership",
        payeeId: "payee-association",
        outflow: 37.5,
      }),
    ],
    mapping,
    resolveMerchant,
  );

  assert.equal(
    preview.summary.exactMatches,
    1,
    "trusted recognition should match the same stable payee ID even when the register display name differs",
  );
  assert.equal(preview.summary.newTransactions, 0);

  const candidate = preview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.status, "exact-match");
  assert.equal(candidate.matchedTransactionId, "manual-association-renamed");
});
