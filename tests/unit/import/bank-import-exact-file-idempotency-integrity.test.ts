import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegisterTransactionsFromImport,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import { recoverExactDuplicateFileCandidates } from "../../../apps/web/src/features/accounts/transactionImportPreviewPreparation.js";

function candidate(): TransactionImportCandidate {
  return {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-05",
      payee: "Coffee Shop",
      inflow: 0,
      outflow: 50,
      importedCategoryName: "Dining",
      raw: {},
    },
    status: "new",
    reason: "reviewed as a new transaction",
    selected: true,
    reviewDecision: "import-as-new",
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-05",
        rawPayee: "Coffee Shop",
        inflow: 0,
        outflow: 50,
      },
      merchant: {
        canonicalPayee: "Coffee Shop",
        suggestedCategoryName: "Dining",
        transferAccountName: null,
      },
      proposal: {
        payee: "Coffee Shop",
        categoryName: "Dining",
        transferAccountName: null,
      },
    },
  };
}

test("exact-file reimport does not expose an existing stable import transaction after user edits", () => {
  const sourceCandidate = candidate();
  const [originalImport] = buildRegisterTransactionsFromImport(
    [sourceCandidate],
    {
      identityScope: "sha256:exact-file",
      categories: [{ id: "dining", name: "Dining" }],
    },
  );

  assert.ok(originalImport?.id);

  const existingTransaction = {
    id: originalImport.id,
    date: sourceCandidate.parsed.date,

    // The user edited both fields after the original import.
    payee: "User Renamed Merchant",
    categoryId: "groceries",
    categoryName: "Groceries",

    inflow: sourceCandidate.parsed.inflow,
    outflow: sourceCandidate.parsed.outflow,
  };

  const recovered = recoverExactDuplicateFileCandidates({
    candidates: [sourceCandidate],
    existingTransactions: [existingTransaction] as never,
    isExactDuplicateFile: true,
    identityScope: "sha256:exact-file",
  });

  assert.deepEqual(
    recovered.representedCandidates.map((item) => item.id),
    ["row-2"],
    "an exact-file row whose stable persisted transaction already exists must remain represented after mutable register edits",
  );

  assert.equal(
    recovered.reviewCandidates.length,
    0,
    "the same exact-file transaction must not be exposed for a same-ID re-commit that can overwrite user edits",
  );
});
