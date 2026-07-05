import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const stylesSource = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(
  dialogSource,
  /function getImportRecommendationLabel/,
  "review cards should derive a clear recommendation label",
);
assert.match(
  dialogSource,
  /Recommendation: \{getImportRecommendationLabel\(candidate\)\}/,
  "review card header should show the recommendation beside status",
);
assert.match(
  dialogSource,
  /getImportConfidenceLabel\(candidate\.confidence\)/,
  "review card header should show human-readable confidence",
);
assert.match(
  dialogSource,
  /transaction-import-confidence-\$\{getImportConfidenceTone\(candidate\.confidence\)\}/,
  "review card header should apply confidence tone classes",
);
assert.match(
  stylesSource,
  /\.transaction-import-recommendation/,
  "review recommendation badge should be styled",
);
assert.match(
  stylesSource,
  /\.transaction-import-confidence-high/,
  "high confidence should have a distinct style",
);
assert.match(
  stylesSource,
  /\.transaction-import-confidence-medium/,
  "medium confidence should have a distinct style",
);
assert.match(
  stylesSource,
  /\.transaction-import-confidence-low/,
  "low confidence should have a distinct style",
);

console.log("v2.62.0 transaction import review card header checks passed");
