import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(
  new URL(
    "../../../apps/web/src/pages/PayeeManagementPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("duplicate review brings the selected group into view", () => {
  assert.match(page, /duplicateReviewRef\.current\?\.scrollIntoView/);
  assert.match(
    page,
    /className="payee-duplicate-review" ref=\{duplicateReviewRef\}/,
  );
});

test("directory and duplicate search share ranking while compact and range-selection paths remain", () => {
  assert.match(page, /rankPayeeSearchMatches\(visiblePayees, query\)/);
  assert.match(page, /rankPayeeSearchGroups\(duplicateGroups, search,/);
  assert.match(page, /if \(search\.trim\(\) \|\| showAllPayees\)/);
  assert.match(page, /\.slice\(0, COMPACT_PAYEE_LIMIT\)/);
  assert.match(page, /const rangeIds = filteredPayees\s*\.slice\(/);
});

test("ignored duplicate suggestions are durable rather than session-only", () => {
  assert.match(page, /async function ignoreDuplicateGroup\(\)/);
  assert.match(page, /buildDuplicateGroupSuppressions/);
  assert.match(page, /selectedDuplicateGroup\.payees\.map/);
  assert.match(page, /keepPayeesSeparate/);
  assert.match(page, /writeDuplicateSuppressions/);
  assert.match(page, /Hide this entire group and remember the decision\./);
  assert.doesNotMatch(page, /ignoredDuplicateGroupIds/);
  assert.doesNotMatch(page, /for this session only/);
});

test("merge confirmation puts the payee to keep first", () => {
  assert.match(page, /getPayeeMergeParticipantIds/);
  assert.match(
    page,
    /getPayeeMergeParticipantIds\(\s*selectedMergePayeeIds,\s*mergeTargetPayeeId,\s*\)/,
  );
  assert.match(page, /orderedSelectedMergePayees\.map/);
  assert.match(page, />Payee to keep</);
});

test("manual merge opens searchable selection with an empty source list", () => {
  assert.match(
    page,
    /function openMergeDialog\(\)[\s\S]*?setSelectedMergePayeeIds\(\[\]\)[\s\S]*?setMergeTargetPayeeId\(selectedPayee\.id\)[\s\S]*?setMergeDialogStep\("select"\)/,
  );
  assert.match(page, /filterPayeeMergeCandidates/);
  assert.match(page, /No matching payees found\./);
});

test("payee directory and detail use separate desktop scroll regions with a mobile reset", () => {
  const styles = readFileSync(
    new URL("../../../apps/web/src/styles/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /\.payee-management-page \.payee-management-list[\s\S]*?overflow-y: auto/);
  assert.match(styles, /\.payee-management-page \.payee-management-detail-panel[\s\S]*?overflow-y: auto/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?height: auto[\s\S]*?\.payee-management-page \.payee-management-list \{ overflow: visible; \}/);
});

test("high-confidence duplicate groups are discoverable from the list", () => {
  assert.match(page, /highConfidenceDuplicateCount/);
  assert.match(page, /isStrictEquivalentDuplicateGroup/);
  assert.match(page, /confidenceDifference/);
  assert.match(page, /className="payee-duplicate-confidence-badge"/);
  assert.match(page, />\s*High confidence\s*</);
  assert.match(page, /No case\/spacing-only matches found\./);
});

test("strict-equivalent duplicate groups are called out as high confidence", () => {
  assert.match(page, /selectedDuplicateGroupHasStrictEquivalentNames/);
  assert.match(page, /className="payee-duplicate-confidence"/);
  assert.match(page, />High-confidence duplicate</);
  assert.match(
    page,
    /These payee names differ only\s+by capitalisation or spacing/,
  );
});
