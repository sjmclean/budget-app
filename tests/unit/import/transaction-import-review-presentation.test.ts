import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import type { TransactionImportCandidate } from "../../../apps/web/src/features/accounts/transactionImport.js";
import { getTransactionImportReviewPresentation } from "../../../apps/web/src/features/accounts/transactionImportReviewPresentation.js";
import {
  getEligibleManualRegisterMatches,
  getRegisterMatchOwnership,
  MANUAL_IMPORT_MATCH_REASON,
  selectManualOwnedRegisterMatch,
  repairRestoredRegisterMatchOwnership,
} from "../../../apps/web/src/features/accounts/transactionImportReviewOwnership.js";
import {
  capturePreparedTransactionImportCandidates,
  resetTransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImportReviewReset.js";
import {
  readTransactionImportSessionEntity,
  writeTransactionImportSessionEntity,
} from "../../../apps/web/src/features/accounts/entities/importSessionEntity.js";
import type { TransactionImportSessionSnapshot } from "../../../apps/web/src/features/accounts/transactionImportSession.js";

function transaction(id: string, date = "2026-08-01", outflow = 20): RegisterTransactionView {
  return { id, date, payee: `Register ${id}`, category: "Groceries", memo: "Register memo", outflow, inflow: 0, runningBalance: 0, cleared: true, reconciled: false, attachmentCount: 0 };
}

function candidate(id: string, status: TransactionImportCandidate["status"] = "new"): TransactionImportCandidate {
  return {
    id,
    parsed: { rowNumber: 1, date: "2026-09-14", payee: "RAW SHOP", memo: "Bank memo", outflow: 20, inflow: 0, raw: {} },
    status,
    reason: status === "invalid" ? "Bad date" : "Review",
    selected: status === "new",
    errors: status === "invalid" ? ["Bad date"] : [],
    lifecycle: {
      source: { rowNumber: 1, date: "2026-09-14", rawPayee: "RAW SHOP", memo: "Bank memo", outflow: 20, inflow: 0 },
      merchant: { canonicalPayee: "Canonical Shop", suggestedCategoryName: "Groceries", transferAccountName: null },
      proposal: {
        payee: "Canonical Shop",
        categoryName: "Split",
        transferAccountName: null,
        memo: "Reviewed memo",
        splitLines: [
          { id: "one", category: "Groceries", outflow: 10, inflow: 0 },
          { id: "two", category: "Dining", outflow: 10, inflow: 0 },
        ],
      },
    },
  };
}

test("presentation maps domain status and ownership-filtered alternative count only", () => {
  const suggested = getTransactionImportReviewPresentation(candidate("exact", "exact-match"), 0);
  assert.equal(suggested.kind, "suggested-match");
  assert.equal(suggested.title, "Suggested match");
  assert.equal(getTransactionImportReviewPresentation(candidate("possible"), 2).kind, "possible-match");
  assert.equal(getTransactionImportReviewPresentation(candidate("new"), 0).kind, "no-match");
  assert.equal(getTransactionImportReviewPresentation(candidate("invalid", "invalid"), 3).kind, "invalid");
});

test("manual selection accepts same amount outside seven days and preserves proposal state", () => {
  const source = candidate("import-a");
  const distant = transaction("register-distant", "2026-01-01");
  const selected = selectManualOwnedRegisterMatch({
    candidate: source,
    transaction: distant,
    ownership: new Map(),
  });

  assert.notEqual(selected, source);
  assert.equal(selected.status, "exact-match");
  assert.equal(selected.matchedTransaction, distant);
  assert.equal(selected.reason, MANUAL_IMPORT_MATCH_REASON);
  assert.deepEqual(selected.lifecycle.proposal, source.lifecycle.proposal);
  assert.equal(selected.matchCandidates?.at(-1)?.automaticMatch, false);
  assert.equal(selected.matchCandidates?.at(-1)?.reason, MANUAL_IMPORT_MATCH_REASON);

  const presentation = getTransactionImportReviewPresentation(selected, 0);
  assert.equal(presentation.kind, "selected-match");
  assert.equal(presentation.title, "Selected match");
  assert.equal(presentation.subtext, "You selected this register transaction.");
});

test("manual eligibility is same amount, ownership-safe, and deterministic", () => {
  const source = candidate("import-a");
  const selfSelected = selectManualOwnedRegisterMatch({
    candidate: source,
    transaction: transaction("self"),
    ownership: new Map([["self", source.id]]),
  });
  assert.equal(selfSelected.matchedTransactionId, "self");
  assert.equal(selectManualOwnedRegisterMatch({
    candidate: source,
    transaction: transaction("wrong-amount", "2026-09-14", 19),
    ownership: new Map(),
  }), source);
  assert.equal(selectManualOwnedRegisterMatch({
    candidate: source,
    transaction: transaction("owned"),
    ownership: new Map([["owned", "import-b"]]),
  }), source);

  const processedOwner = selectManualOwnedRegisterMatch({
    candidate: candidate("import-b"), transaction: transaction("processed"), ownership: new Map(),
  });
  const ownership = getRegisterMatchOwnership({
    candidates: [source],
    processedCandidates: [{ candidate: processedOwner, action: "matched", processedAt: 1 }],
  });
  assert.deepEqual(
    getEligibleManualRegisterMatches({
      candidate: source,
      transactions: [transaction("wrong", "2026-09-14", 19), transaction("processed"), transaction("same-day", "2026-09-14"), transaction("distant")],
      ownership,
    }).map((entry) => entry.id),
    ["same-day", "distant"],
  );
});

test("manual match survives unfinished-session persistence and restores ownership", () => {
  const storageValues = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => { storageValues.set(key, value); },
    removeItem: (key: string) => { storageValues.delete(key); },
    listKeys: () => [...storageValues.keys()],
  };
  const source = candidate("import-a");
  const selected = selectManualOwnedRegisterMatch({
    candidate: source,
    transaction: transaction("register-session"),
    ownership: new Map(),
  });
  const snapshot: TransactionImportSessionSnapshot = {
    version: 2,
    accountId: "checking",
    savedAt: "2026-09-15T00:00:00.000Z",
    fileName: "statement.qif",
    fileType: "qif",
    fileHash: null,
    csvText: null,
    qifText: "!Type:Bank",
    ofxText: null,
    ofxInspection: null,
    qifDetection: null,
    qifDateFormat: "day-first",
    qifAmountFormat: "decimal-dot",
    analysis: null,
    mapping: {},
    preview: {} as TransactionImportSessionSnapshot["preview"],
    candidates: [selected],
    preparedCandidates: { [source.id]: source },
    bankCandidateDetails: {},
    sourceIdentities: {},
    processedCandidates: [],
    matchEditorOrigins: { [source.id]: source },
    matchedTransactionOrigins: {},
    manualCandidateEdits: {},
    historicalRegisterPayeeUpdates: [],
    previouslyImportedCount: 0,
    alreadyRepresentedCount: 0,
    excludeMemos: false,
    updateMatchedTransactionDates: false,
  };
  writeTransactionImportSessionEntity(storage, snapshot);
  const restored = readTransactionImportSessionEntity(storage, "checking");
  assert.ok(restored);
  assert.deepEqual(restored.candidates[0], selected);
  const restoredPresentation = getTransactionImportReviewPresentation(restored.candidates[0]!, 0);
  assert.equal(restoredPresentation.kind, "selected-match");
  assert.equal(restoredPresentation.title, "Selected match");
  const repaired = repairRestoredRegisterMatchOwnership({
    candidates: restored.candidates,
    processedCandidates: restored.processedCandidates,
  });
  assert.equal(
    getRegisterMatchOwnership(repaired).get("register-session"),
    source.id,
  );
  const competitor = candidate("import-b");
  assert.equal(selectManualOwnedRegisterMatch({
    candidate: competitor,
    transaction: transaction("register-session"),
    ownership: getRegisterMatchOwnership(repaired),
  }), competitor);
});

test("switching and reset release manual ownership without losing the prepared state", () => {
  const source = candidate("import-a");
  const preparedCandidates = capturePreparedTransactionImportCandidates([source]);
  const first = selectManualOwnedRegisterMatch({ candidate: source, transaction: transaction("r1"), ownership: new Map() });
  const firstOwnership = getRegisterMatchOwnership({ candidates: [first], processedCandidates: [] });
  const second = selectManualOwnedRegisterMatch({ candidate: first, transaction: transaction("r2"), ownership: firstOwnership });
  const secondOwnership = getRegisterMatchOwnership({ candidates: [second], processedCandidates: [] });
  assert.equal(secondOwnership.has("r1"), false);
  assert.equal(secondOwnership.get("r2"), source.id);

  const reset = resetTransactionImportCandidate({
    candidates: [second],
    candidateId: source.id,
    preparedCandidates,
    manualEdits: {}, historicalUpdates: [],
    matchEditorOrigins: { [source.id]: source }, matchedTransactionOrigins: {},
    ownership: secondOwnership,
  });
  assert.ok(reset && !reset.conflict);
  assert.deepEqual(reset.candidates[0], source);
  const importedAsNew = { ...second, status: "new" as const, selected: true, reviewDecision: "import-as-new" as const };
  assert.equal(getRegisterMatchOwnership({ candidates: [importedAsNew], processedCandidates: [] }).has("r2"), false);
});


test("import review clearly separates bank source from proposed payee", () => {
  const dialog = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(dialog, /Bank statement/);
  assert.match(
    dialog,
    /\{sourcePayee \|\| "Missing payee"\}[\s\S]*?Will import as: \{candidate\.lifecycle\.proposal\.payee\}/,
  );
  assert.doesNotMatch(dialog, /Bank transaction/);
});

test("manual new-transaction payee edit is authoritative over merchant inference", () => {
  const dialog = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const saveStart = dialog.indexOf("function saveTransactionEdit");
  const saveEnd = dialog.indexOf(
    "function removeHistoricalPayeeMapping",
    saveStart,
  );
  const saveSource = dialog.slice(saveStart, saveEnd);

  assert.match(
    saveSource,
    /const reviewedPayee = transferAccountName[\s\S]*?: payee;/,
  );
  assert.match(
    saveSource,
    /updateCandidateProposal\(candidate\.id, \{[\s\S]*?payee: reviewedPayee,/,
  );
  assert.doesNotMatch(
    saveSource,
    /buildTransactionImportMerchantProposal\(/,
  );
});

test("recent import outcomes share one treatment and scheduled ghosts remain distinct", () => {
  const css = readFileSync(
    new URL("../../../apps/web/src/styles/register.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.register-row-recent-imported:not\([\s\S]*?var\(--warning-bg\)[\s\S]*?var\(--warning\)/,
  );
  assert.match(
    css,
    /\.register-row-recent-matched:not\([\s\S]*?var\(--warning-bg\)[\s\S]*?var\(--warning\)/,
  );
  assert.match(
    css,
    /\.register-import-activity-badge-matched\s*\{[\s\S]*?var\(--warning-bg\)[\s\S]*?var\(--warning\)/,
  );
  assert.match(
    css,
    /\.register-scheduled-ghost-row\s*\{[\s\S]*?var\(--accent\) 14%[\s\S]*?var\(--surface\)/,
  );
  assert.doesNotMatch(
    css.match(/\.register-scheduled-ghost-row\s*\{[\s\S]*?\}/)?.[0] ?? "",
    /var\(--surface-subtle\)/,
  );
});
