import assert from "node:assert/strict";
import {
  verifyImportCommitPlan,
  type ImportCommitPlan,
  type ImportCommitSession,
} from "../apps/web/src/features/accounts/importCommitEngine";
import type { TransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImport";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";

function candidate(id: string, overrides: Partial<TransactionImportCandidate> = {}): TransactionImportCandidate {
  return {
    id,
    parsed: {
      rowNumber: Number(id.replace(/\D/g, "")) || 1,
      date: "2026-07-18",
      payee: "Grocer",
      outflow: 10,
      inflow: 0,
      raw: {},
    },
    status: "new",
    reason: "New transaction",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date: "2026-07-18",
        rawPayee: "Grocer",
        outflow: 10,
        inflow: 0,
      },
      merchant: {
        canonicalPayee: "Grocer",
        suggestedCategoryName: "Groceries",
        transferAccountName: null,
      },
      proposal: {
        payee: "Grocer",
        categoryName: "Groceries",
        transferAccountName: null,
      },
    },
    ...overrides,
  };
}

const registerTransaction: RegisterTransactionView = {
  id: "register-1",
  date: "2026-07-17",
  attachmentCount: 0,
  payee: "Grocer",
  category: "Groceries",
  categoryId: "cat-groceries",
  inflow: 0,
  outflow: 10,
  runningBalance: 90,
  cleared: false,
  reconciled: false,
};

const imported = candidate("row-1");
const matched = candidate("row-2", {
  status: "exact-match",
  selected: false,
  matchedTransactionId: registerTransaction.id,
  matchedTransaction: registerTransaction,
});

function session(overrides: Partial<ImportCommitSession> = {}): ImportCommitSession {
  return {
    accountId: "checking",
    accountName: "Checking",
    importedCandidates: [imported],
    matchedCandidates: [matched],
    completedSourceCandidates: [imported, matched],
    skippedCount: 0,
    previouslyImportedCount: 0,
    alreadyRepresentedCount: 0,
    editedMatchedCandidateIds: new Set(),
    includeMemos: true,
    updateMatchedTransactionDates: false,
    categories: [{ id: "cat-groceries", name: "Groceries" }],
    accounts: [
      { id: "checking", name: "Checking" },
      { id: "savings", name: "Savings" },
    ],
    merchantKnowledge: {} as ImportCommitSession["merchantKnowledge"],
    file: { fileType: "qif" },
    ...overrides,
  };
}

function plan(overrides: Partial<ImportCommitPlan> = {}): ImportCommitPlan {
  return {
    additions: [{
      date: "2026-07-18",
      payee: "Grocer",
      category: "Groceries",
      categoryId: "cat-groceries",
      inflow: 0,
      outflow: 10,
    }],
    matchedTransactionUpdates: [],
    merchantKnowledge: {} as ImportCommitPlan["merchantKnowledge"],
    ...overrides,
  };
}

const valid = verifyImportCommitPlan(session(), plan());
assert.equal(valid.valid, true);
assert.deepEqual(valid.issues, []);

const overlap = verifyImportCommitPlan(
  session({ matchedCandidates: [imported], completedSourceCandidates: [imported] }),
  plan(),
);
assert.equal(overlap.valid, false);
assert.ok(overlap.issues.some((issue) => issue.code === "candidate-overlap"));

const duplicateMatch = candidate("row-3", {
  status: "exact-match",
  selected: false,
  matchedTransactionId: registerTransaction.id,
  matchedTransaction: registerTransaction,
});
const duplicateMatchResult = verifyImportCommitPlan(
  session({
    matchedCandidates: [matched, duplicateMatch],
    completedSourceCandidates: [imported, matched, duplicateMatch],
  }),
  plan(),
);
assert.ok(
  duplicateMatchResult.issues.some((issue) => issue.code === "duplicate-register-match"),
);

const invalidTransfer = verifyImportCommitPlan(
  session(),
  plan({
    additions: [{
      date: "2026-07-18",
      payee: "Transfer: Missing",
      category: "Transfer",
      inflow: 0,
      outflow: 10,
    }],
  }),
);
assert.ok(invalidTransfer.issues.some((issue) => issue.code === "invalid-transfer"));

const invalidCategory = verifyImportCommitPlan(
  session(),
  plan({
    additions: [{
      date: "2026-07-18",
      payee: "Grocer",
      category: "Groceries",
      categoryId: "wrong-category",
      inflow: 0,
      outflow: 10,
    }],
  }),
);
assert.ok(
  invalidCategory.issues.some((issue) => issue.code === "invalid-category-reference"),
);

const invalidAmount = verifyImportCommitPlan(
  session(),
  plan({
    additions: [{
      date: "2026-07-18",
      payee: "Grocer",
      category: "Groceries",
      categoryId: "cat-groceries",
      inflow: 10,
      outflow: 10,
    }],
  }),
);
assert.ok(
  invalidAmount.issues.some((issue) => issue.code === "invalid-transaction-amount"),
);

console.log("v3.22.7 import commit plan verification tests passed");
