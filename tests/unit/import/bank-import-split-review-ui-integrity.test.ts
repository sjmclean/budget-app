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

test("bank import review exposes Split for new and matched transactions", () => {
  const splitOptions = dialogSource.match(
    /includeSplitOption(?:\s|\/?>)/g,
  );

  assert.ok(
    (splitOptions?.length ?? 0) >= 2,
    "both new and matched category editors must expose Split",
  );

  assert.doesNotMatch(
    dialogSource,
    /includeSplitOption=\{false\}/,
    "the importer must not explicitly disable Split",
  );
});

test("bank import review uses the shared register split editor", () => {
  assert.match(
    dialogSource,
    /import\s+\{\s*RegisterSplitEditor\s*\}\s+from\s+"\.\/RegisterSplitEditor"/,
  );

  assert.match(
    dialogSource,
    /<RegisterSplitEditor[\s\S]*?Apply Split[\s\S]*?Cancel Split[\s\S]*?<\/RegisterSplitEditor>/,
  );
});

test("selecting Split opens an editor instead of immediately persisting an empty split", () => {
  assert.match(
    dialogSource,
    /if\s*\(value === "Split" && currentCandidate\)\s*\{\s*beginProposalSplitEdit\(currentCandidate\);\s*return;/,
  );

  assert.match(
    dialogSource,
    /if\s*\(value === "Split"\)\s*\{\s*beginMatchedSplitEdit\(candidate\);\s*return;/,
  );
});

test("split review starts with at least two lines and must be balanced before apply", () => {
  const twoLineSeeds = dialogSource.match(
    /\[createSplitLineDraft\(\), createSplitLineDraft\(\)\]/g,
  );

  assert.ok(
    (twoLineSeeds?.length ?? 0) >= 2,
    "new and matched split conversion should both start with two lines",
  );

  assert.match(
    dialogSource,
    /hasIncompleteSplitDrafts\(splitEdit\.splitLines\)/,
  );

  assert.match(
    dialogSource,
    /isSplitDraftBalanced\(/,
  );

  assert.match(
    dialogSource,
    /disabled=\{[\s\S]*?splitEdit\.splitLines\.length < 2[\s\S]*?hasIncompleteSplitDrafts[\s\S]*?!isSplitDraftBalanced/,
  );
});

test("applying a reviewed split writes final split lines and clears transfer state", () => {
  assert.match(
    dialogSource,
    /const splitLines = buildSplitLines\([\s\S]*?splitEdit\.splitLines,[\s\S]*?categoryOptions/,
  );

  assert.match(
    dialogSource,
    /updateCandidateProposal\(candidate\.id,\s*\{\s*categoryName: "Split",\s*transferAccountName: null,\s*splitLines,/,
  );

  assert.match(
    dialogSource,
    /updateMatchedTransactionDetails\(candidate\.id,\s*\{\s*category: "Split",\s*categoryId: undefined,\s*transferAccountId: undefined,\s*transferTransactionId: undefined,\s*splitLines,/,
  );
});

test("switching away from Split clears stale proposal and matched split lines", () => {
  assert.match(
    dialogSource,
    /function clearProposalSplit[\s\S]*?splitLines: undefined/,
  );

  assert.match(
    dialogSource,
    /updateMatchedTransactionDetails\(candidate\.id,\s*\{[\s\S]*?category: value,[\s\S]*?transferAccountId: undefined,[\s\S]*?transferTransactionId: undefined,[\s\S]*?splitLines: undefined/,
  );
});

test("import actions cannot proceed while a split edit is open", () => {
  const activeSplitGuards = dialogSource.match(
    /splitEdit\?\.candidateId === candidate\.id/g,
  );

  assert.ok(
    (activeSplitGuards?.length ?? 0) >= 2,
    "matched acceptance and new import must both be blocked while editing a split",
  );
});

test("review validation rejects Split without actual balanced split lines", () => {
  assert.match(
    dialogSource,
    /const declaresSplit =\s*candidate\.lifecycle\.proposal\.categoryName === "Split"/,
  );

  assert.match(
    dialogSource,
    /!declaresSplit && !hasSplitLines[\s\S]*?declaresSplit &&[\s\S]*?hasSplitLines[\s\S]*?splitLines\.length >= 2/,
  );

  assert.match(
    dialogSource,
    /isSplitBalanced\(\s*proposed\.outflow,\s*proposed\.inflow,\s*splitLines/,
  );
});
