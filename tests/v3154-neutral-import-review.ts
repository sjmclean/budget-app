import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const stylesSource = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.doesNotMatch(
  dialogSource,
  /Recommendation:|Why this recommendation\?|getImportRecommendationLabel|getImportConfidenceLabel|transaction-import-confidence|Import match evidence/,
  "import review should not present recommendations, confidence ratings, or evidence panels",
);
assert.match(
  dialogSource,
  />\s*Imported\s*</,
  "review should identify the imported transaction",
);
assert.match(
  dialogSource,
  />\s*In Register\s*</,
  "review should identify an existing register transaction",
);
assert.match(
  dialogSource,
  />\s*Closest candidate\s*</,
  "review may neutrally identify the closest candidate without recommending an action",
);
assert.match(
  dialogSource,
  /candidate\.status === "exact-match"[\s\S]*?>\s*Use Existing\s*</,
  "exact matches should let the user keep the existing register transaction",
);
assert.match(
  dialogSource,
  /candidate\.status === "possible-match"[\s\S]*?>\s*Match\s*</,
  "possible matches should retain an explicit Match action",
);
assert.match(
  dialogSource,
  /candidate\.status === "(?:exact-match|possible-match)"[\s\S]*?>\s*Not a Match\s*</,
  "matched candidates should let the user reject the match",
);
assert.match(
  dialogSource,
  />\s*Skip\s*</,
  "review should retain an explicit Skip action",
);
assert.doesNotMatch(
  stylesSource,
  /\.transaction-import-recommendation|\.transaction-import-confidence(?:-|\s|\{)|\.transaction-import-evidence-panel/,
  "obsolete recommendation, confidence, and evidence styles should be removed",
);
assert.match(
  stylesSource,
  /\.transaction-import-match-row-closest/,
  "closest-candidate presentation should remain visually distinct but neutral",
);

console.log("v3.15.4 neutral import review checks passed");
