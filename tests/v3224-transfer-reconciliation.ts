import assert from "node:assert/strict";
import {
  previewTransactionQifImport,
  buildRegisterTransactionsFromImport,
} from "../apps/web/src/features/accounts/transactionImport";
import { reconcileTransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImportReconciliation";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { ParsedImportTransaction } from "../apps/web/src/features/accounts/transactionImportParser";

const parsed: ParsedImportTransaction = {
  rowNumber: 1,
  date: "2026-07-15",
  payee: "Transfer",
  transferAccountName: "Savings",
  outflow: 500,
  inflow: 0,
  raw: {},
};

const linkedTransfer: RegisterTransactionView = {
  id: "transfer-source",
  date: "2026-07-15",
  payee: "Transfer: Savings",
  category: "Transfer",
  outflow: 500,
  inflow: 0,
  runningBalance: 0,
  attachmentCount: 0,
  cleared: false,
  reconciled: false,
  transferId: "transfer-1",
  transferAccountId: "savings-account",
  transferTransactionId: "transfer-target",
};

const ordinarySameAmount: RegisterTransactionView = {
  ...linkedTransfer,
  id: "ordinary",
  payee: "Savings Club",
  category: "Entertainment",
  transferId: undefined,
  transferAccountId: undefined,
  transferTransactionId: undefined,
};

const matched = reconcileTransactionImportCandidate({
  parsed,
  existingTransactions: [ordinarySameAmount, linkedTransfer],
  merchantResolution: {
    canonicalPayee: "Transfer: Savings",
    suggestedCategoryName: null,
    transferAccountName: "Savings",
  },
  transferAccounts: [{ id: "savings-account", name: "Savings" }],
});
assert.equal(matched.kind, "transfer");
assert.equal(matched.status, "exact-match");
assert.equal(matched.selectedCandidate?.transaction.id, "transfer-source");
assert.equal(matched.transfer?.accountId, "savings-account");
assert.equal(matched.candidates.length, 1);

const missing = reconcileTransactionImportCandidate({
  parsed,
  existingTransactions: [],
  merchantResolution: {
    canonicalPayee: "Transfer: Savings",
    suggestedCategoryName: null,
    transferAccountName: "Savings",
  },
  transferAccounts: [],
});
assert.equal(missing.kind, "transfer");
assert.equal(missing.status, "new");
assert.equal(missing.transfer?.status, "missing");

const qif = `!Type:Bank\nD15/07/2026\nT-500.00\nPSavings transfer\nL[Savings]\n^\n`;
const preview = previewTransactionQifImport(
  qif,
  [],
  {
    sourceAccountName: "Checking",
    availableTransferAccountNames: ["Savings"],
    transferAccounts: [{ id: "savings-account", name: "Savings" }],
    dateFormat: "DD/MM/YYYY",
    amountFormat: "decimal-dot",
  },
);
assert.equal(preview.candidates.length, 1);
const candidate = preview.candidates[0]!;
assert.equal(candidate.reconciliationKind, "transfer");
assert.equal(candidate.lifecycle.proposal.transferAccountName, "Savings");
assert.equal(candidate.transferResolution?.status, "resolved");
assert.equal(candidate.status, "new");
assert.equal(candidate.selected, true);

const additions = buildRegisterTransactionsFromImport([candidate]);
assert.equal(additions.length, 1);
assert.equal(additions[0]?.payee, "Transfer: Savings");
assert.equal(additions[0]?.category, "Transfer");
assert.equal(additions[0]?.categoryId, undefined);

console.log("v3.22.4 transfer reconciliation tests passed");
