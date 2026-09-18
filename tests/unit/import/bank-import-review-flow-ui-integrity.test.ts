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
const styleSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/styles/register.css",
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
    /transaction-import-match-date[\s\S]*?transaction-import-match-payee[\s\S]*?transaction-import-match-category[\s\S]*?transaction-import-match-memo[\s\S]*?transaction-import-match-amount/,
  );
});

test("transaction editing is consolidated under the overflow menu", () => {
  assert.match(dialogSource, /aria-label="More transaction actions"/);
  assert.match(dialogSource, />\s*Edit Transaction\s*</);
  assert.match(dialogSource, />\s*Find Existing Transaction\s*</);
  assert.doesNotMatch(dialogSource, />\s*Edit Payee\s*</);
  assert.doesNotMatch(dialogSource, />\s*Edit Category\s*</);
  assert.doesNotMatch(dialogSource, />\s*(?:Add|Edit) Memo\s*</);
});

test("transaction editor keeps bank date and amount read-only while editing review metadata", () => {
  assert.match(
    dialogSource,
    /Date and amount come from the bank file and cannot be changed here\./,
  );
  assert.match(dialogSource, /<span>Payee<\/span>[\s\S]*?<PayeeInput/);
  assert.match(dialogSource, /<span>Category<\/span>[\s\S]*?<RegisterCategoryInput/);
  assert.match(dialogSource, /<span>Memo<\/span>[\s\S]*?<input/);
  assert.match(dialogSource, /<TransactionTagPicker[\s\S]*?selectedTagIds=\{transactionEditDraft\.tagIds\}/);
  assert.match(dialogSource, /<strong>Attachments<\/strong>/);
});

test("reviewed memo explicitly overrides the global source-memo exclusion", () => {
  assert.match(dialogSource, /memoReviewed: true/);
  assert.ok(
    dialogSource.includes(
      "A memo saved here is kept even when “Don’t import transaction memos” is enabled.",
    ),
  );
});


test("open transaction overflow menu escapes its card and stacks above later review rows", () => {
  assert.match(
    styleSource,
    /\.transaction-import-review-card:has\(\.transaction-import-more-actions\[open\]\)[\s\S]*?z-index:\s*30;[\s\S]*?overflow:\s*visible;/,
  );
  assert.match(
    styleSource,
    /\.transaction-import-more-actions\[open\][\s\S]*?z-index:\s*31;/,
  );
});


test("transaction editor requires explicit dismissal and protects the parent import dialog", () => {
  const editorBackdropClass =
    'className="transaction-import-transaction-editor-backdrop"';
  const editorBackdropClassIndex = dialogSource.indexOf(editorBackdropClass);
  assert.ok(editorBackdropClassIndex >= 0);
  const editorBackdropTagStart = dialogSource.lastIndexOf(
    "<div",
    editorBackdropClassIndex,
  );
  const editorBackdropTagEnd = dialogSource.indexOf(
    ">",
    editorBackdropClassIndex,
  );
  assert.ok(editorBackdropTagStart >= 0 && editorBackdropTagEnd > editorBackdropTagStart);
  const editorBackdropOpeningTag = dialogSource.slice(
    editorBackdropTagStart,
    editorBackdropTagEnd + 1,
  );
  assert.doesNotMatch(editorBackdropOpeningTag, /onClick=/);
  assert.match(
    dialogSource,
    /function requestClose\(\) \{[\s\S]*?isImporting \|\| transactionEditDraft[\s\S]*?return;/,
  );
  assert.match(dialogSource, /aria-label="Close transaction editor"[\s\S]*?onClick=\{closeTransactionEdit\}/);
  assert.match(dialogSource, />\s*Cancel\s*</);
});

test("transaction editor uses the register tag picker instead of raw tag checkboxes", () => {
  assert.match(
    dialogSource,
    /import \{ TransactionTagPicker \} from "\.\/TransactionRow"/,
  );
  assert.match(dialogSource, /<TransactionTagPicker/);
  assert.doesNotMatch(
    dialogSource,
    /transactionTags\.map\(\(tag\) => \([\s\S]*?type="checkbox"/,
  );
});


test("transaction editor autocomplete menus stack above the nested modal", () => {
  assert.match(
    styleSource,
    /\.transaction-import-transaction-editor \.register-autocomplete-popup \{[\s\S]*?z-index:\s*1200;/,
  );
});
