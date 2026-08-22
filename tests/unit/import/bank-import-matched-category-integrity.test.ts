import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  prepareImportCommit,
  ImportCommitValidationError,
  type ImportCommitSession,
} from "../../../apps/web/src/features/accounts/importCommitEngine.js";
import {
  createEmptyMerchantKnowledgeStore,
} from "../../../apps/web/src/features/accounts/merchantKnowledge.js";
import type {
  RegisterTransactionView,
} from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import type {
  TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  buildTransactionImportSourceIdentities,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";

function matchedTransaction(): RegisterTransactionView {
  return {
    id: "register-1",
    date: "2026-08-12",
    attachmentCount: 0,
    payee: "Cafe",
    category: "Dining",
    categoryId: "groceries",
    inflow: 0,
    outflow: 50,
    runningBalance: -50,
    cleared: false,
    reconciled: false,
  };
}

function matchedCandidate(
  transaction: RegisterTransactionView,
): TransactionImportCandidate {
  return {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-12",
      payee: "Cafe",
      inflow: 0,
      outflow: 50,
      raw: {},
    },
    status: "exact-match",
    reason: "matched existing transaction",
    selected: false,
    errors: [],
    matchedTransactionId: transaction.id,
    matchedTransaction: transaction,
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-12",
        rawPayee: "Cafe",
        inflow: 0,
        outflow: 50,
      },
      merchant: {
        canonicalPayee: "Cafe",
        suggestedCategoryName: "Dining",
        transferAccountName: null,
      },
      proposal: {
        payee: "Cafe",
        categoryName: "Dining",
        transferAccountName: null,
      },
    },
  };
}

test("matched import rejects a category name paired with a different category ID", () => {
  const transaction = matchedTransaction();
  const candidate = matchedCandidate(transaction);

  const session: ImportCommitSession = {
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
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "dining", name: "Dining" },
    ],
    accounts: [{ id: "checking", name: "Checking" }],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "statement.csv",
      fileHash: "sha256:matched-category-fixture",
    },
  };

  assert.throws(
    () => prepareImportCommit(session),
    (error) =>
      error instanceof ImportCommitValidationError &&
      error.message.includes("category"),
    "a matched update must not persist Dining with the Groceries category ID",
  );
});

test("matched import accepts a consistent changed category name and ID", () => {
  const transaction = {
    ...matchedTransaction(),
    category: "Dining",
    categoryId: "dining",
  };
  const candidate = matchedCandidate(transaction);

  const session: ImportCommitSession = {
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
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "dining", name: "Dining" },
    ],
    accounts: [{ id: "checking", name: "Checking" }],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "statement.csv",
      fileHash: "sha256:matched-category-fixture",
    },
  };

  const plan = prepareImportCommit(session);

  assert.equal(plan.matchedTransactionUpdates.length, 1);
  assert.equal(plan.matchedTransactionUpdates[0]?.category, "Dining");
  assert.equal(plan.matchedTransactionUpdates[0]?.categoryId, "dining");
});

test("automatic matched import retains bank raw payee without changing user-facing fields", () => {
  const transaction = {
    ...matchedTransaction(),
    payee: "My Friendly Cafe",
    memo: "User-entered memo",
    rawPayee: undefined,
    categoryId: "dining",
  };

  const candidate = matchedCandidate(transaction);
  candidate.parsed.payee = "CAFE MELBOURNE TERMINAL 04";
  candidate.parsed.memo = "Card ending 5934";
  candidate.lifecycle.source.rawPayee = "CAFE MELBOURNE TERMINAL 04";
  candidate.lifecycle.source.memo = "Card ending 5934";
  candidate.lifecycle.proposal.payee = "My Friendly Cafe";

  const session: ImportCommitSession = {
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
    editedMatchedCandidateIds: new Set(),
    includeMemos: true,
    updateMatchedTransactionDates: false,
    categories: [{ id: "dining", name: "Dining" }],
    accounts: [{ id: "checking", name: "Checking" }],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "statement-a.csv",
      fileHash: "sha256:matched-raw-payee-fixture",
    },
  };

  const plan = prepareImportCommit(session);

  assert.equal(plan.matchedTransactionUpdates.length, 1);
  assert.equal(
    plan.matchedTransactionUpdates[0]?.rawPayee,
    "CAFE MELBOURNE TERMINAL 04",
  );
  assert.equal(plan.matchedTransactionUpdates[0]?.payee, "My Friendly Cafe");
  assert.equal(
    plan.matchedTransactionUpdates[0]?.memo,
    "User-entered memo",
    "retaining bank provenance must not overwrite the user's transaction memo",
  );
});

test("matched import never overwrites existing retained bank raw payee", () => {
  const transaction = {
    ...matchedTransaction(),
    rawPayee: "ORIGINAL BANK DESCRIPTION",
    categoryId: "dining",
  };

  const candidate = matchedCandidate(transaction);
  candidate.lifecycle.source.rawPayee = "LATER BANK DESCRIPTION";

  const session: ImportCommitSession = {
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
    editedMatchedCandidateIds: new Set(),
    includeMemos: true,
    updateMatchedTransactionDates: false,
    categories: [{ id: "dining", name: "Dining" }],
    accounts: [{ id: "checking", name: "Checking" }],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "statement-b.csv",
      fileHash: "sha256:existing-raw-payee-fixture",
    },
  };

  const plan = prepareImportCommit(session);

  assert.equal(
    plan.matchedTransactionUpdates.length,
    0,
    "an existing retained raw payee must not cause an unnecessary or destructive rewrite",
  );
});


test("account register import adapter preserves matched raw bank payee", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/pages/AccountRegisterPage.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /payeeId:\s*transaction\.payeeId,\s*rawPayee:\s*transaction\.rawPayee,/,
  );
});
