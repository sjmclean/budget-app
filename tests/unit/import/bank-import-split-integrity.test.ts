import assert from "node:assert/strict";
import test from "node:test";

import {
  ImportCommitValidationError,
  prepareImportCommit,
  type ImportCommitSession,
} from "../../../apps/web/src/features/accounts/importCommitEngine.js";
import type {
  RegisterSplitLineView,
  RegisterTransactionView,
} from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  createEmptyMerchantKnowledgeStore,
} from "../../../apps/web/src/features/accounts/merchantKnowledge.js";
import type {
  TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  buildTransactionImportSourceIdentities,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";
import {
  verifyPersistedImportTransactions,
} from "../../../apps/web/src/features/accounts/transactionImportVerification.js";

const categories = [
  { id: "groceries", name: "Groceries" },
  { id: "household", name: "Household" },
  { id: "medical", name: "Medical" },
];

function balancedSplitLines(): RegisterSplitLineView[] {
  return [
    {
      id: "split-groceries",
      category: "Groceries",
      categoryId: "groceries",
      memo: "Food",
      outflow: 100,
      inflow: 0,
    },
    {
      id: "split-household",
      category: "Household",
      categoryId: "household",
      memo: "Cleaning",
      outflow: 30,
      inflow: 0,
    },
    {
      id: "split-medical",
      category: "Medical",
      categoryId: "medical",
      memo: "Pharmacy",
      outflow: 20,
      inflow: 0,
    },
  ];
}

function importedSplitCandidate(): TransactionImportCandidate {
  return {
    id: "row-split-1",
    parsed: {
      rowNumber: 1,
      date: "2026-08-20",
      payee: "WOOLWORTHS 1234",
      memo: "Bank purchase",
      inflow: 0,
      outflow: 150,
      raw: {
        date: "2026-08-20",
        payee: "WOOLWORTHS 1234",
        amount: "-150.00",
      },
    },
    status: "new",
    reason: "new transaction",
    selected: true,
    reviewDecision: "import-as-new",
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date: "2026-08-20",
        rawPayee: "WOOLWORTHS 1234",
        memo: "Bank purchase",
        inflow: 0,
        outflow: 150,
      },
      merchant: {
        canonicalPayee: "Woolworths",
        suggestedCategoryName: "Groceries",
        transferAccountName: null,
      },
      proposal: {
        payee: "Woolworths",
        categoryName: "Split",
        transferAccountName: null,
        splitLines: balancedSplitLines(),
      },
    },
  };
}

function importedSession(
  candidate: TransactionImportCandidate,
): ImportCommitSession {
  return {
    accountId: "checking",
    accountName: "Checking",
    importedCandidates: [candidate],
    matchedCandidates: [],
    completedSourceCandidates: [candidate],
    sourceIdentities: buildTransactionImportSourceIdentities(
      "csv",
      [candidate],
    ),
    skippedCount: 0,
    previouslyImportedCount: 0,
    alreadyRepresentedCount: 0,
    editedMatchedCandidateIds: new Set(),
    includeMemos: true,
    updateMatchedTransactionDates: false,
    categories,
    accounts: [
      { id: "checking", name: "Checking" },
      { id: "savings", name: "Savings" },
    ],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "statement.csv",
      fileHash: "sha256:split-import-fixture",
    },
  };
}

function matchedSplitTransaction(): RegisterTransactionView {
  return {
    id: "register-split-1",
    date: "2026-08-20",
    attachmentCount: 0,
    payee: "Woolworths",
    rawPayee: "WOOLWORTHS 1234",
    category: "Split",
    inflow: 0,
    outflow: 150,
    runningBalance: -150,
    cleared: false,
    reconciled: false,
    splitLines: balancedSplitLines(),
  };
}

function matchedSplitCandidate(): TransactionImportCandidate {
  const transaction = matchedSplitTransaction();

  return {
    id: "row-matched-split",
    parsed: {
      rowNumber: 1,
      date: "2026-08-20",
      payee: "WOOLWORTHS 1234",
      inflow: 0,
      outflow: 150,
      raw: {},
    },
    status: "exact-match",
    matchedTransactionId: transaction.id,
    matchedTransaction: transaction,
    reason: "matched split transaction",
    selected: false,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date: "2026-08-20",
        rawPayee: "WOOLWORTHS 1234",
        inflow: 0,
        outflow: 150,
      },
      merchant: {
        canonicalPayee: "Woolworths",
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: "Woolworths",
        categoryName: "Split",
        transferAccountName: null,
        splitLines: balancedSplitLines(),
      },
    },
  };
}

function matchedSession(
  candidate: TransactionImportCandidate,
): ImportCommitSession {
  return {
    accountId: "checking",
    accountName: "Checking",
    importedCandidates: [],
    matchedCandidates: [candidate],
    completedSourceCandidates: [candidate],
    sourceIdentities: buildTransactionImportSourceIdentities(
      "csv",
      [candidate],
    ),
    skippedCount: 0,
    previouslyImportedCount: 0,
    alreadyRepresentedCount: 0,
    editedMatchedCandidateIds: new Set([candidate.id]),
    includeMemos: true,
    updateMatchedTransactionDates: false,
    categories,
    accounts: [
      { id: "checking", name: "Checking" },
      { id: "savings", name: "Savings" },
    ],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "statement.csv",
      fileHash: "sha256:matched-split-fixture",
    },
  };
}

function expectInvalidSplit(
  candidate: TransactionImportCandidate,
  expectedText?: string,
) {
  assert.throws(
    () => prepareImportCommit(importedSession(candidate)),
    (error) =>
      error instanceof ImportCommitValidationError &&
      error.message.includes("split") &&
      (!expectedText || error.message.includes(expectedText)),
  );
}

test("reviewed imported split becomes one split register transaction with the original bank amount", () => {
  const candidate = importedSplitCandidate();
  const plan = prepareImportCommit(importedSession(candidate));

  assert.equal(plan.additions.length, 1);

  const addition = plan.additions[0];

  assert.equal(addition?.category, "Split");
  assert.equal(addition?.categoryId, undefined);
  assert.equal(addition?.outflow, 150);
  assert.equal(addition?.inflow, 0);

  assert.deepEqual(addition?.splitLines, balancedSplitLines());

  assert.equal(
    addition?.splitLines?.reduce(
      (total, line) => total + line.outflow,
      0,
    ),
    150,
  );
});

test("unbalanced imported split is rejected before commit", () => {
  const candidate = importedSplitCandidate();

  candidate.lifecycle.proposal.splitLines = [
    ...balancedSplitLines().slice(0, 2),
    {
      ...balancedSplitLines()[2],
      outflow: 10,
    },
  ];

  expectInvalidSplit(candidate, "balance");
});

test("split parent requires at least two child lines", () => {
  const candidate = importedSplitCandidate();

  candidate.lifecycle.proposal.splitLines = [
    {
      id: "split-only",
      category: "Groceries",
      categoryId: "groceries",
      outflow: 150,
      inflow: 0,
    },
  ];

  expectInvalidSplit(candidate, "at least two");
});

test("duplicate split-line IDs are rejected", () => {
  const candidate = importedSplitCandidate();

  candidate.lifecycle.proposal.splitLines = balancedSplitLines().map(
    (line) => ({
      ...line,
      id: "duplicate-split-id",
    }),
  );

  expectInvalidSplit(candidate, "duplicate");
});

test("split child must reference a consistent available category", () => {
  const candidate = importedSplitCandidate();

  candidate.lifecycle.proposal.splitLines = [
    {
      ...balancedSplitLines()[0],
      category: "Groceries",
      categoryId: "household",
    },
    ...balancedSplitLines().slice(1),
  ];

  expectInvalidSplit(candidate, "category");
});

test("transfer and split cannot coexist in one imported proposal", () => {
  const candidate = importedSplitCandidate();

  candidate.lifecycle.proposal.transferAccountName = "Savings";

  expectInvalidSplit(candidate, "both a transfer and a split");
});

test("new imported splits learn merchant identity and account but no category evidence", () => {
  const candidate = importedSplitCandidate();
  const plan = prepareImportCommit(importedSession(candidate));

  const merchant = plan.merchantKnowledge.merchants.find(
    (entry) => entry.preferredName === "Woolworths",
  );

  assert.ok(merchant, "merchant identity should still be learned");
  assert.ok(
    merchant.aliases.length > 0,
    "bank-description alias evidence should still be learned",
  );
  assert.ok(
    merchant.accountUsage.some(
      (usage) => usage.accountId === "checking",
    ),
    "account evidence should still be learned",
  );

  assert.deepEqual(
    merchant.categoryUsage,
    [],
    "a split must not teach Split or any child category",
  );
});

test("edited matched splits also produce no merchant category evidence", () => {
  const candidate = matchedSplitCandidate();
  const plan = prepareImportCommit(matchedSession(candidate));

  assert.equal(plan.matchedTransactionUpdates.length, 1);

  const merchant = plan.merchantKnowledge.merchants.find(
    (entry) => entry.preferredName === "Woolworths",
  );

  assert.ok(merchant);
  assert.ok(
    merchant.accountUsage.some(
      (usage) => usage.accountId === "checking",
    ),
  );
  assert.deepEqual(
    merchant.categoryUsage,
    [],
    "matched split edits must not teach Split or child categories",
  );
});

test("post-commit verification checks the complete reviewed split structure", () => {
  const candidate = importedSplitCandidate();
  const plan = prepareImportCommit(importedSession(candidate));
  const expected = plan.additions[0];

  assert.ok(expected);

  const persisted: RegisterTransactionView = {
    id: expected.id,
    date: expected.date,
    attachmentCount: 0,
    payee: expected.payee,
    rawPayee: expected.rawPayee,
    category: expected.category,
    categoryId: expected.categoryId,
    memo: expected.memo,
    inflow: expected.inflow,
    outflow: expected.outflow,
    runningBalance: -150,
    cleared: false,
    reconciled: false,
    splitLines: expected.splitLines?.map((line) => ({ ...line })),
  };

  assert.doesNotThrow(() =>
    verifyPersistedImportTransactions(
      [expected],
      [persisted],
    ),
  );

  const corrupted: RegisterTransactionView = {
    ...persisted,
    splitLines: persisted.splitLines?.map((line, index) =>
      index === 0
        ? {
            ...line,
            outflow: line.outflow - 5,
          }
        : line,
    ),
  };

  assert.throws(
    () =>
      verifyPersistedImportTransactions(
        [expected],
        [corrupted],
      ),
    /splitLines\[0\]\.outflow/,
  );
});
