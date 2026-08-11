import assert from "node:assert/strict";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { ParsedImportTransaction } from "../apps/web/src/features/accounts/transactionImportParser";
import {
  reconcileTransactionImportCandidate,
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
} from "../apps/web/src/features/accounts/transactionImportReconciliation";

function existing(
  id: string,
  date: string,
  payee: string,
  outflow: number,
  category = "Uncategorised",
): RegisterTransactionView {
  return {
    id,
    date,
    attachmentCount: 0,
    payee,
    category,
    outflow,
    inflow: 0,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
  };
}

const imported: ParsedImportTransaction = {
  rowNumber: 2,
  date: "2026-07-16",
  payee: "Harvey Norman Online Homebush West",
  outflow: 143.95,
  inflow: 0,
  raw: {},
};

assert.equal(TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS, 7);

const merchantMatch = existing(
  "merchant-match",
  "2026-07-14",
  "Harvey Norman Online 02 9763 6891 036",
  143.95,
  "Fiona School Stuff",
);
const closerDifferentMerchant = existing(
  "closer-other",
  "2026-07-15",
  "Different Merchant",
  143.95,
);

const decision = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [closerDifferentMerchant, merchantMatch],
  merchantResolution: {
    canonicalPayee: "Harvey Norman Online",
    suggestedCategoryName: "Fiona School Stuff",
    transferAccountName: null,
  },
});

assert.equal(decision.status, "exact-match");
assert.equal(decision.recommendation, "match");
assert.equal(decision.selectedCandidate?.transaction.id, "merchant-match");
assert.deepEqual(
  decision.candidates.map((candidate) => candidate.transaction.id),
  ["merchant-match", "closer-other"],
  "resolved merchant matches are ordered before other exact-amount candidates",
);
assert.equal(decision.candidates[0]?.merchantMatches, true);
assert.equal(decision.candidates[1]?.merchantMatches, false);

const closestWithoutMerchant = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [
    existing("three-days", "2026-07-13", "Unrelated A", 143.95),
    existing("one-day", "2026-07-15", "Unrelated B", 143.95),
  ],
});
assert.equal(closestWithoutMerchant.status, "new");
assert.equal(closestWithoutMerchant.selectedCandidate, undefined);
assert.equal(closestWithoutMerchant.candidates[0]?.transaction.id, "one-day");

const excluded = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [merchantMatch],
  excludedTransactionIds: new Set([merchantMatch.id]),
});
assert.equal(excluded.status, "new");

const outsideWindow = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [
    existing("too-old", "2026-07-08", "Harvey Norman Online", 143.95),
  ],
  merchantResolution: {
    canonicalPayee: "Harvey Norman Online",
    suggestedCategoryName: null,
    transferAccountName: null,
  },
});
assert.equal(outsideWindow.status, "new");

const wrongAmount = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [
    existing("wrong-amount", "2026-07-16", "Harvey Norman Online", 143.96),
  ],
});
assert.equal(wrongAmount.status, "new");

console.log("v3.23.1 Actual-style import reconciliation tests passed");
