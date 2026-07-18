import assert from "node:assert/strict";
import {
  reconcileTransactionImportCandidate,
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
} from "../apps/web/src/features/accounts/transactionImportReconciliation";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { ParsedImportTransaction } from "../apps/web/src/features/accounts/transactionImportParser";

function existing(
  id: string,
  date: string,
  payee: string,
  outflow: number,
): RegisterTransactionView {
  return {
    id,
    accountId: "checking",
    date,
    payee,
    categoryId: null,
    category: "Uncategorised",
    memo: "",
    outflow,
    inflow: 0,
    cleared: false,
    reconciled: false,
    flag: null,
    transferAccountId: null,
    transferTransactionId: null,
    splits: [],
  };
}

const imported: ParsedImportTransaction = {
  rowNumber: 2,
  date: "2026-07-10",
  payee: "WOOLWORTHS 1234",
  outflow: 42.5,
  inflow: 0,
  raw: {},
};

const exact = existing("exact", "2026-07-12", "Woolworths", 42.5);
const weaker = existing("weaker", "2026-07-10", "Unrelated Shop", 42.5);

const decision = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [weaker, exact],
  merchantResolution: {
    canonicalPayee: "Woolworths",
    suggestedCategoryName: "Groceries",
    transferAccountName: null,
  },
});

assert.equal(decision.status, "exact-match");
assert.equal(decision.recommendation, "match");
assert.equal(decision.selectedCandidate?.transaction.id, "exact");
assert.equal(decision.candidates[0]?.transaction.id, "exact");
assert.equal(decision.evidence?.some((item) => item.label === "Amount"), true);

const excluded = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [exact],
  excludedTransactionIds: new Set(["exact"]),
});
assert.equal(excluded.status, "new");
assert.equal(excluded.candidates.length, 0);

const outsideWindow = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [
    existing("old", "2026-06-01", "Woolworths", 42.5),
  ],
});
assert.equal(outsideWindow.status, "new");
assert.equal(outsideWindow.candidates.length, 0);
assert.match(outsideWindow.reason, new RegExp(String(TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS)));

const roundedAmount = reconcileTransactionImportCandidate({
  parsed: { ...imported, outflow: 42.504 },
  existingTransactions: [exact],
  merchantResolution: {
    canonicalPayee: "Woolworths",
    suggestedCategoryName: null,
    transferAccountName: null,
  },
});
assert.equal(roundedAmount.status, "exact-match", "matching remains cent-based");

console.log("v3.22.0 transaction import reconciliation engine tests passed");
