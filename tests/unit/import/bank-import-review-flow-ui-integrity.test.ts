import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dialogSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("bank review row always renders immutable source values", () => {
  assert.match(
    dialogSource,
    /\{sourcePayee \|\| "Missing payee"\}/,
  );
  assert.doesNotMatch(
    dialogSource,
    /Bank:\s*\{bankParsed\.payee/,
    "edited proposal values must not replace the bank transaction payee",
  );
  assert.match(
    dialogSource,
    /candidate\.lifecycle\.source\.importedCategoryName[\s\S]*?candidate\.lifecycle\.source\.memo/,
  );
});

test("unmatched proposal row appears only for a real comparison", () => {
  assert.match(
    dialogSource,
    /const showUnmatchedComparison =[\s\S]*?!hasMatch[\s\S]*?availableRegisterMatchCandidates\.length > 0[\s\S]*?hasManualProposalEdits/,
  );
  assert.match(
    dialogSource,
    /\{showUnmatchedComparison \? \(/,
  );
});

test("manual match selection is the matched decision, not an intermediate confirmation", () => {
  assert.match(
    dialogSource,
    /function selectManualRegisterTransaction[\s\S]*?processCandidate\(candidateId, "matched", selected\);[\s\S]*?return true;/,
  );
  assert.match(
    dialogSource,
    /function processCandidate\([\s\S]*?resolvedCandidate\?: TransactionImportCandidate[\s\S]*?resolvedCandidate \?\?[\s\S]*?candidates\.find/,
  );
});

test("automatic exact matches still retain explicit Use Existing review", () => {
  assert.match(
    dialogSource,
    /onClick=\{\(\) => acceptMatchedCandidate\(candidate\.id\)\}[\s\S]*?"Use Existing"/,
  );
});

test("manual match picker communicates that selection is the final use decision", () => {
  assert.match(dialogSource, />\s*Use this transaction\s*</);
  assert.doesNotMatch(dialogSource, />\s*Choose this transaction\s*</);
});


test("review rows present date, payee, category, memo, and amount as one compact transaction row", () => {
  assert.match(
    dialogSource,
    /transaction-import-match-date[sS]*?transaction-import-match-payee[sS]*?transaction-import-match-category[sS]*?transaction-import-match-memo[sS]*?transaction-import-match-amount/,
  );
});

test("transaction editing is consolidated under the overflow menu", () => {
  assert.match(dialogSource, /aria-label="More transaction actions"/);
  assert.match(dialogSource, />s*Edit Transactions*</);
  assert.match(dialogSource, />s*Find Existing Transactions*</);
  assert.doesNotMatch(dialogSource, />s*Edit Payees*</);
  assert.doesNotMatch(dialogSource, />s*Edit Categorys*</);
  assert.doesNotMatch(dialogSource, />s*(?:Add|Edit) Memos*</);
});

test("transaction editor keeps bank date and amount read-only while editing review metadata", () => {
  assert.match(
    dialogSource,
    /Date and amount come from the bank file and cannot be changed here./,
  );
  assert.match(dialogSource, /<span>Payee</span>[sS]*?<PayeeInput/);
  assert.match(dialogSource, /<span>Category</span>[sS]*?<RegisterCategoryInput/);
  assert.match(dialogSource, /<span>Memo</span>[sS]*?<input/);
  assert.match(dialogSource, /<legend>Tags</legend>/);
  assert.match(dialogSource, /<strong>Attachments</strong>/);
});

test("reviewed memo explicitly overrides the global source-memo exclusion", () => {
  assert.match(dialogSource, /memoReviewed: true/);
  assert.match(
    dialogSource,
    /A memo saved here is kept even when “Don’t import transaction memos” is enabled./,
  );
});
