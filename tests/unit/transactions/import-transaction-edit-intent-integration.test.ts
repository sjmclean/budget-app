import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

test("import review uses one unified transaction editor instead of per-field edit intent", () => {
  assert.match(source, /interface TransactionImportEditDraft/);
  assert.match(source, /function beginTransactionEdit\(/);
  assert.match(source, /function saveTransactionEdit\(/);
  assert.doesNotMatch(source, /type TransactionEditIntent/);
  assert.doesNotMatch(source, /getTransactionFieldEditBehaviour/);
  assert.doesNotMatch(source, /ProposedTransactionEditField/);
});

test("unified import editor reuses shared payee and category controls", () => {
  assert.match(source, /<PayeeInput[\s\S]*?value=\{transactionEditDraft\.payee\}/);
  assert.match(source, /<RegisterCategoryInput[\s\S]*?value=\{transactionEditDraft\.category\}/);
  assert.match(source, /includeSplitOption/);
});

test("import edit scope excludes date and amount mutations", () => {
  assert.match(
    source,
    /Date and amount come from the bank file and cannot be changed here\./,
  );
  assert.match(source, /<strong>Date<\/strong>/);
  assert.match(source, /<strong>Amount<\/strong>/);

  const draftBlock = source.match(
    /interface TransactionImportEditDraft \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.doesNotMatch(draftBlock, /\bdate\s*:/);
  assert.doesNotMatch(draftBlock, /\b(?:outflow|inflow|amount)\s*:/);
});

test("unified import editor edits payee, category, memo, tags, and attachments", () => {
  const draftBlock = source.match(
    /interface TransactionImportEditDraft \{[\s\S]*?\n\}/,
  )?.[0] ?? "";

  assert.match(draftBlock, /payee: string/);
  assert.match(draftBlock, /category: string/);
  assert.match(draftBlock, /memo: string/);
  assert.match(draftBlock, /tagIds: string\[\]/);
  assert.match(draftBlock, /attachments: ScheduledAttachmentTemplate\[\]/);
  assert.match(draftBlock, /splitLines: SplitLineDraft\[\]/);

  assert.match(source, />\s*Save transaction\s*</);
  assert.match(source, />\s*Cancel\s*</);
  assert.match(source, /memoReviewed: true/);
});


test("unified import editor uses register tag and split controls", () => {
  assert.match(
    source,
    /import \{ TransactionTagPicker \} from "\.\/TransactionRow"/,
  );
  assert.match(
    source,
    /<TransactionTagPicker[\s\S]*?onCreateTag=\{onCreateTransactionTag\}/,
  );
  assert.match(
    source,
    /transactionEditDraft\.category === "Split"[\s\S]*?<RegisterSplitEditor/,
  );
  assert.match(
    source,
    /!isSplitDraftBalanced\([\s\S]*?draft\.splitLines/,
  );
});
