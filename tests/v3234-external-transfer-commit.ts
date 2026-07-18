import assert from "node:assert/strict";
import { prepareImportCommit } from "../apps/web/src/features/accounts/importCommitEngine";
import {
  previewTransactionQifImport,
  type TransactionImportMerchantResolver,
} from "../apps/web/src/features/accounts/transactionImport";
import type {
  QifAmountFormat,
  QifDateFormat,
} from "../apps/web/src/features/accounts/transactionImportInspection";

const qif = `!Type:Bank\nD16/07/2026\nT-10.00\nPONLINE E4278038017 pocket money F McLean\nL[External Pocket Money]\n^\n`;

const resolveMerchant: TransactionImportMerchantResolver = () => ({
  canonicalPayee: "Transfer: Pocket Money",
  suggestedCategoryName: "Pocket Money",
  transferAccountName: "External Pocket Money",
});

const options: {
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

const preview = previewTransactionQifImport(qif, [], options, resolveMerchant);
assert.equal(preview.candidates.length, 1);

const candidate = preview.candidates[0];
assert.equal(candidate.status, "new");
assert.equal(candidate.lifecycle.proposal.transferAccountName, null);
assert.equal(
  candidate.lifecycle.proposal.payee,
  "ONLINE E4278038017 pocket money F McLean",
);
assert.equal(
  candidate.lifecycle.merchant.canonicalPayee,
  "ONLINE E4278038017 pocket money F McLean",
);

const plan = prepareImportCommit({
  accountId: "everyday-account",
  accountName: "Everyday Account",
  importedCandidates: [candidate],
  matchedCandidates: [],
  completedSourceCandidates: [candidate],
  skippedCount: 0,
  previouslyImportedCount: 0,
  alreadyRepresentedCount: 0,
  editedMatchedCandidateIds: new Set(),
  includeMemos: true,
  updateMatchedTransactionDates: false,
  categories: [{ id: "cat-pocket-money", name: "Pocket Money" }],
  accounts: [{ id: "everyday-account", name: "Everyday Account" }],
  // Simulate malformed or legacy persisted knowledge. Merchant learning is
  // non-critical and must never prevent an otherwise valid import commit.
  merchantKnowledge: {} as never,
  file: {
    fileType: "qif",
    qifText: qif,
    qifDateFormat: options.dateFormat,
    qifAmountFormat: options.amountFormat,
  },
});

assert.equal(plan.additions.length, 1);
assert.equal(plan.additions[0].payee, "ONLINE E4278038017 pocket money F McLean");
assert.notEqual(plan.additions[0].category, "Transfer");

console.log("v3.23.4 external transfer commit tests passed");
