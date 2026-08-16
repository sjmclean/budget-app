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
  assert.match(page, /const orderedSelectedMergePayees =/);
  assert.match(page, /left\.id === mergeTargetPayeeId/);
  assert.match(page, /orderedSelectedMergePayees\.map/);
  assert.match(page, />Payee to keep</);
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
