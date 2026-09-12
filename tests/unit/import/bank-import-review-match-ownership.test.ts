import assert from "node:assert/strict";
import test from "node:test";

import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import type { TransactionImportCandidate } from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  getConflictingRegisterMatchOwner,
  getRegisterMatchOwnership,
  restoreOwnedRegisterMatch,
  selectOwnedRegisterMatch,
} from "../../../apps/web/src/features/accounts/transactionImportReviewOwnership.js";
import type { PersistedProcessedImportCandidate } from "../../../apps/web/src/features/accounts/transactionImportSession.js";

function register(id: string): RegisterTransactionView {
  return {
    id,
    date: "2026-09-01",
    payee: "Coles",
    category: "Groceries",
    outflow: 10.9,
    inflow: 0,
    runningBalance: 0,
    cleared: true,
    reconciled: false,
    attachmentCount: 0,
  };
}

function candidate(id: string, rowNumber: number, date: string, matches: string[]): TransactionImportCandidate {
  const matchCandidates = matches.map((transactionId) => ({
    transaction: register(transactionId),
    evidence: [],
    daysApart: 0,
    payeeSimilarity: 100,
    merchantMatches: true,
    amountCompetitionCount: 2,
    matchScore: 100,
    automaticMatch: true,
    reason: "Exact amount and payee",
  }));
  return {
    id,
    parsed: { rowNumber, date, payee: "Coles", outflow: 10.9, inflow: 0, raw: {} },
    status: "new",
    reason: "Review",
    matchCandidates,
    selected: true,
    errors: [],
    lifecycle: {
      source: { rowNumber, date, rawPayee: "Coles", outflow: 10.9, inflow: 0 },
      merchant: { canonicalPayee: "Coles", suggestedCategoryName: "Groceries", transferAccountName: null },
      proposal: { payee: "Coles", categoryName: "Groceries", transferAccountName: null },
    },
  };
}

function matched(source: TransactionImportCandidate, transactionId: string): TransactionImportCandidate {
  const option = source.matchCandidates!.find((entry) => entry.transaction.id === transactionId)!;
  return {
    ...source,
    status: "exact-match",
    recommendation: "match",
    matchedTransactionId: transactionId,
    matchedTransaction: option.transaction,
    evidence: option.evidence,
    reason: option.reason,
  };
}

function processed(candidate: TransactionImportCandidate): PersistedProcessedImportCandidate {
  return { candidate, action: "matched", processedAt: 1 };
}

function importMatchAsNew(
  source: TransactionImportCandidate,
): TransactionImportCandidate {
  return {
    ...source,
    status: "new",
    selected: true,
    reviewDecision: "import-as-new",
    reason: "Review the new transaction details before importing it.",
    errors: [],
  };
}

test("accepted processed match remains reserved and direct selection cannot steal it", () => {
  const owner = matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r");
  const pending = candidate("import-b", 2, "2026-09-02", ["register-r"]);
  const ownership = getRegisterMatchOwnership({ candidates: [pending], processedCandidates: [processed(owner)] });

  assert.equal(ownership.get("register-r"), "import-a");
  assert.equal(selectOwnedRegisterMatch(pending, "register-r", ownership), pending);
  assert.equal(pending.matchedTransactionId, undefined);
});

test("matched processing detects ownership held by another candidate", () => {
  const owner = matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r");
  const pending = matched(candidate("import-b", 2, "2026-09-02", ["register-r"]), "register-r");
  const ownership = getRegisterMatchOwnership({ candidates: [pending], processedCandidates: [processed(owner)] });

  assert.equal(getConflictingRegisterMatchOwner(ownership, pending.id, "register-r"), "import-a");
});

test("restoring a processed match releases processed ownership without conflicting with itself", () => {
  const owner = matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r");
  const restoredOwnership = getRegisterMatchOwnership({ candidates: [owner], processedCandidates: [] });

  assert.equal(restoredOwnership.get("register-r"), "import-a");
  assert.notEqual(selectOwnedRegisterMatch(owner, "register-r", restoredOwnership), owner);
});

test("switching an active candidate transfers ownership from R1 to R2", () => {
  const owner = matched(candidate("import-a", 1, "2026-09-01", ["register-r1", "register-r2"]), "register-r1");
  const before = getRegisterMatchOwnership({ candidates: [owner], processedCandidates: [] });
  const switched = selectOwnedRegisterMatch(owner, "register-r2", before);
  const after = getRegisterMatchOwnership({ candidates: [switched], processedCandidates: [] });

  assert.equal(after.has("register-r1"), false);
  assert.equal(after.get("register-r2"), "import-a");
});

test("an active exact match owns R until the review transition imports it as new", () => {
  const exactMatch = matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r");
  const before = getRegisterMatchOwnership({ candidates: [exactMatch], processedCandidates: [] });
  const importedAsNew = importMatchAsNew(exactMatch);
  const after = getRegisterMatchOwnership({ candidates: [importedAsNew], processedCandidates: [] });

  assert.equal(before.get("register-r"), "import-a");
  assert.equal(importedAsNew.matchedTransactionId, "register-r");
  assert.equal(after.has("register-r"), false);
});

test("another active candidate can claim a match released by import-as-new", () => {
  const importedAsNew = importMatchAsNew(
    matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r"),
  );
  const second = candidate("import-b", 2, "2026-09-02", ["register-r"]);
  const released = getRegisterMatchOwnership({ candidates: [importedAsNew, second], processedCandidates: [] });
  const claimed = selectOwnedRegisterMatch(second, "register-r", released);
  const ownership = getRegisterMatchOwnership({ candidates: [importedAsNew, claimed], processedCandidates: [] });

  assert.equal(claimed.matchedTransactionId, "register-r");
  assert.equal(ownership.get("register-r"), "import-b");
});

test("returning to match options cannot steal R after another candidate claims it", () => {
  const originalMatch = matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r");
  const importedAsNew = importMatchAsNew(originalMatch);
  const second = matched(candidate("import-b", 2, "2026-09-02", ["register-r"]), "register-r");
  const ownership = getRegisterMatchOwnership({ candidates: [importedAsNew, second], processedCandidates: [] });
  const restored = restoreOwnedRegisterMatch(importedAsNew, originalMatch, ownership);
  const after = getRegisterMatchOwnership({ candidates: [restored, second], processedCandidates: [] });

  assert.equal(restored, importedAsNew);
  assert.equal(restored.status, "new");
  assert.equal(restored.reviewDecision, "import-as-new");
  assert.equal(after.get("register-r"), "import-b");
});

test("returning to match options may reclaim R when it remains unclaimed", () => {
  const originalMatch = matched(candidate("import-a", 1, "2026-09-01", ["register-r"]), "register-r");
  const importedAsNew = importMatchAsNew(originalMatch);
  const released = getRegisterMatchOwnership({ candidates: [importedAsNew], processedCandidates: [] });
  const restored = restoreOwnedRegisterMatch(importedAsNew, originalMatch, released);
  const ownership = getRegisterMatchOwnership({ candidates: [restored], processedCandidates: [] });

  assert.equal(restored, originalMatch);
  assert.equal(ownership.get("register-r"), "import-a");
});

test("two Coles rows one day apart cannot accept the same processed register match", () => {
  const first = matched(candidate("coles-1", 1, "2026-09-01", ["register-coles"]), "register-coles");
  const second = candidate("coles-2", 2, "2026-09-02", ["register-coles"]);
  const ownership = getRegisterMatchOwnership({ candidates: [second], processedCandidates: [processed(first)] });
  const attempted = selectOwnedRegisterMatch(second, "register-coles", ownership);

  assert.equal(ownership.get("register-coles"), "coles-1");
  assert.equal(attempted.matchedTransactionId, undefined);
});
