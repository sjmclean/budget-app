import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegisterTransactionsFromImport,
  parseTransactionCsv,
  parseTransactionOfx,
  parseTransactionQif,
  type ParsedImportTransaction,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import { prepareTransactionImportPreview } from "../../../apps/web/src/features/accounts/transactionImportPreviewPreparation.js";
import {
  markImportReviewFieldEdited,
  type ImportReviewManualEdits,
} from "../../../apps/web/src/features/accounts/transactionImportReviewPropagation.js";
import {
  capturePreparedTransactionImportCandidates,
  hasTransactionImportCandidateChanges,
  resetTransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImportReviewReset.js";
import { getRegisterMatchOwnership } from "../../../apps/web/src/features/accounts/transactionImportReviewOwnership.js";

function candidate(parsed: ParsedImportTransaction): TransactionImportCandidate {
  return {
    id: `row-${parsed.rowNumber}`,
    parsed,
    status: "new",
    reason: "Review",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: parsed.rowNumber,
        date: parsed.date,
        rawPayee: parsed.payee,
        memo: parsed.memo,
        inflow: parsed.inflow,
        outflow: parsed.outflow,
      },
      merchant: {
        canonicalPayee: parsed.payee,
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: parsed.payee,
        categoryName: null,
        transferAccountName: null,
      },
    },
  };
}

function prepare(parsed: ParsedImportTransaction, includeSourceMemos: boolean) {
  return prepareTransactionImportPreview({
    partition: {
      activeCandidates: [candidate(parsed)],
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
      sourceIdentities: {},
    },
    existingTransactions: [],
    isExactDuplicateFile: false,
    includeSourceMemos,
  }).reviewCandidates[0]!;
}

test("CSV, QIF, and OFX memos seed the shared review proposal", () => {
  const [csv] = parseTransactionCsv(
    "Date,Payee,Outflow,Memo\n2026-09-14,CSV Shop,12.34,CSV memo",
    { 0: "date", 1: "payee", 2: "outflow", 3: "memo" },
  );
  const [qif] = parseTransactionQif(
    "!Type:Bank\nD09/14/2026\nT-12.34\nPQIF Shop\nMQIF memo\n^",
    { dateFormat: "mdy", amountFormat: "dot-decimal" },
  );
  const [ofx] = parseTransactionOfx([
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260914120000<TRNAMT>-12.34<FITID>memo-1<NAME>OFX Shop<MEMO>OFX memo</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join(""));
  assert.ok(csv && qif && ofx);

  for (const [parsed, expected] of [
    [csv, "CSV memo"],
    [qif, "QIF memo"],
    [ofx, "OFX memo"],
  ] as const) {
    assert.equal(prepare(parsed, true).lifecycle.proposal.memo, expected);
    assert.equal(prepare(parsed, false).lifecycle.proposal.memo, expected);
  }
});

test("memo review remains available while exclusion is enforced at commit", () => {
  const [parsed] = parseTransactionQif(
    "!Type:Bank\nD09/14/2026\nT-12.34\nPShop\nMSource memo\n^",
    { dateFormat: "mdy", amountFormat: "dot-decimal" },
  );
  assert.ok(parsed);
  const excluded = prepare(parsed, false);
  assert.equal(excluded.lifecycle.proposal.memo, "Source memo");

  const withManualMemo = {
    ...excluded,
    lifecycle: {
      ...excluded.lifecycle,
      proposal: { ...excluded.lifecycle.proposal, memo: "Manual memo" },
    },
  };
  assert.equal(buildRegisterTransactionsFromImport([withManualMemo], {
    includeMemos: false,
    identityScope: "memo-manual",
  })[0]?.memo, undefined);
  assert.equal(buildRegisterTransactionsFromImport([withManualMemo], {
    includeMemos: true,
    identityScope: "memo-manual-included",
  })[0]?.memo, "Manual memo");

  const cleared = {
    ...withManualMemo,
    lifecycle: {
      ...withManualMemo.lifecycle,
      proposal: { ...withManualMemo.lifecycle.proposal, memo: undefined },
    },
  };
  assert.equal(buildRegisterTransactionsFromImport([cleared], {
    includeMemos: true,
    identityScope: "memo-cleared",
  })[0]?.memo, undefined);
});

test("memo reset restores only the prepared candidate and clears its marker", () => {
  const original = prepare({
    rowNumber: 1,
    date: "2026-09-14",
    payee: "Recognised Payee",
    memo: "Prepared memo",
    outflow: 12.34,
    inflow: 0,
    raw: {},
  }, true);
  const sibling = { ...original, id: "sibling" };
  const preparedCandidates = capturePreparedTransactionImportCandidates([original, sibling]);
  const edited = {
    ...original,
    lifecycle: {
      ...original.lifecycle,
      proposal: { ...original.lifecycle.proposal, memo: "Edited memo" },
    },
  };
  let manualEdits: ImportReviewManualEdits = {};
  manualEdits = markImportReviewFieldEdited(manualEdits, original.id, "memo");
  manualEdits = markImportReviewFieldEdited(manualEdits, sibling.id, "memo");

  const result = resetTransactionImportCandidate({
    candidates: [edited, sibling],
    candidateId: original.id,
    preparedCandidates,
    manualEdits,
    historicalUpdates: [],
    matchEditorOrigins: {},
    matchedTransactionOrigins: {},
    ownership: getRegisterMatchOwnership({ candidates: [edited, sibling], processedCandidates: [] }),
  });
  assert.ok(result && !result.conflict);
  assert.deepEqual(result.candidates[0], original);
  assert.deepEqual(result.candidates[1], sibling);
  assert.equal(result.manualEdits[original.id], undefined);
  assert.deepEqual(result.manualEdits[sibling.id], { memo: true });
  assert.equal(hasTransactionImportCandidateChanges({
    candidate: result.candidates[0]!,
    preparedCandidate: preparedCandidates[original.id],
    manualEdits: result.manualEdits[original.id],
    hasMatchEditorOrigin: false,
    hasMatchedTransactionOrigin: false,
    historicalUpdates: [],
  }), false);
});

test("an untouched matched memo is preserved while an explicit edit or clear changes it", () => {
  const parsed = {
    rowNumber: 1, date: "2026-09-14", payee: "Shop", memo: "Bank memo",
    outflow: 12.34, inflow: 0, raw: {},
  } satisfies ParsedImportTransaction;
  const matchedMemo = "Existing register memo";
  const matched = {
    ...candidate(parsed),
    status: "exact-match" as const,
    matchedTransactionId: "register-1",
    matchedTransaction: {
      id: "register-1", date: parsed.date, payee: parsed.payee,
      category: "Groceries", memo: matchedMemo, outflow: 12.34, inflow: 0,
      runningBalance: 0, cleared: true, reconciled: false, attachmentCount: 0,
    },
  };
  assert.equal(matched.matchedTransaction.memo, matchedMemo);

  for (const memo of ["Edited", undefined]) {
    const edited = {
      ...matched,
      matchedTransaction: { ...matched.matchedTransaction, memo },
    };
    assert.equal(edited.matchedTransaction.memo, memo);
    const reset = resetTransactionImportCandidate({
      candidates: [edited],
      candidateId: edited.id,
      preparedCandidates: capturePreparedTransactionImportCandidates([matched]),
      manualEdits: { [edited.id]: { memo: true } },
      historicalUpdates: [],
      matchEditorOrigins: {},
      matchedTransactionOrigins: { [edited.id]: matched.matchedTransaction },
      ownership: getRegisterMatchOwnership({ candidates: [edited], processedCandidates: [] }),
    });
    assert.ok(reset && !reset.conflict);
    assert.equal(reset.candidates[0]?.matchedTransaction?.memo, matchedMemo);
    assert.equal(reset.manualEdits[edited.id], undefined);
    assert.equal(reset.matchedTransactionOrigins[edited.id], undefined);
  }
});

test("reviewed split transactions commit memo and still honour exclusion", () => {
  const split = {
    ...candidate({ rowNumber: 1, date: "2026-09-14", payee: "Shop", memo: "Source", outflow: 20, inflow: 0, raw: {} }),
    lifecycle: {
      ...candidate({ rowNumber: 1, date: "2026-09-14", payee: "Shop", memo: "Source", outflow: 20, inflow: 0, raw: {} }).lifecycle,
      proposal: {
        payee: "Shop", categoryName: "Split", transferAccountName: null, memo: "Reviewed split memo",
        splitLines: [
          { id: "one", category: "Groceries", outflow: 10, inflow: 0 },
          { id: "two", category: "Dining", outflow: 10, inflow: 0 },
        ],
      },
    },
  };
  assert.equal(buildRegisterTransactionsFromImport([split], { includeMemos: true, identityScope: "split-memo" })[0]?.memo, "Reviewed split memo");
  assert.equal(buildRegisterTransactionsFromImport([split], { includeMemos: false, identityScope: "split-no-memo" })[0]?.memo, undefined);
});
