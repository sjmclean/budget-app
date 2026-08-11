import assert from "node:assert/strict";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import { previewTransactionQifImport } from "../apps/web/src/features/accounts/transactionImport";
import type { QifAmountFormat, QifDateFormat } from "../apps/web/src/features/accounts/transactionImportInspection";
import { reconcileTransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImportReconciliation";

const registerTransaction: RegisterTransactionView = {
  id: "pocket-money-register-row",
  date: "2026-07-16",
  attachmentCount: 0,
  payee: "Pocket Money",
  category: "Pocket Money",
  outflow: 10,
  inflow: 0,
  runningBalance: 0,
  cleared: false,
  reconciled: false,
};

const parsed = {
  rowNumber: 2,
  date: "2026-07-16",
  payee: "ONLINE E4278038017 pocket money F McLean",
  importedCategoryName: "[External Pocket Money]",
  transferAccountName: "External Pocket Money",
  outflow: 10,
  inflow: 0,
  raw: {},
};

const externalTransferMatch = reconcileTransactionImportCandidate({
  parsed,
  existingTransactions: [registerTransaction],
  merchantResolution: {
    canonicalPayee: "Transfer: External Pocket Money",
    suggestedCategoryName: null,
    transferAccountName: "External Pocket Money",
  },
  transferAccounts: [],
});

assert.equal(externalTransferMatch.kind, "new");
assert.equal(externalTransferMatch.status, "new");
assert.equal(externalTransferMatch.selectedCandidate, undefined);
assert.equal(externalTransferMatch.candidates[0]?.transaction.id, registerTransaction.id);
assert.equal(externalTransferMatch.transfer?.status, "missing");

const qif = `!Type:Bank\nD16/07/2026\nT-10.00\nPONLINE E4278038017 pocket money F McLean\nL[External Pocket Money]\n^\n`;
const qifOptions: {
  sourceAccountName: string;
  availableTransferAccountNames: string[];
  transferAccounts: never[];
  dateFormat: QifDateFormat;
  amountFormat: QifAmountFormat;
} = {
  sourceAccountName: "Everyday Account",
  availableTransferAccountNames: [],
  transferAccounts: [],
  dateFormat: "DD/MM/YYYY",
  amountFormat: "decimal-dot",
};

const preview = previewTransactionQifImport(
  qif,
  [registerTransaction],
  qifOptions,
);

assert.equal(preview.candidates.length, 1);
const candidate = preview.candidates[0];
assert.equal(candidate.status, "new");
assert.equal(candidate.reconciliationKind, "new");
assert.equal(candidate.matchedTransactionId, undefined);
assert.equal(candidate.lifecycle.proposal.transferAccountName, null);
assert.equal(
  candidate.lifecycle.proposal.payee,
  "ONLINE E4278038017 pocket money F McLean",
);
assert.equal(candidate.errors.length, 0);

const internalTransfer = reconcileTransactionImportCandidate({
  parsed,
  existingTransactions: [
    {
      ...registerTransaction,
      id: "linked-transfer",
      transferAccountId: "external-account-id",
    },
  ],
  merchantResolution: {
    canonicalPayee: "Transfer: External Pocket Money",
    suggestedCategoryName: null,
    transferAccountName: "External Pocket Money",
  },
  transferAccounts: [
    { id: "external-account-id", name: "External Pocket Money" },
  ],
});

assert.equal(internalTransfer.kind, "transfer");
assert.equal(internalTransfer.status, "exact-match");
assert.equal(internalTransfer.transfer?.status, "resolved");

console.log("v3.23.3 external transfer fallback tests passed");
