import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const stylesSource = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(
  dialogSource,
  /<details className="transaction-import-evidence-panel">/,
  "review cards should render an expandable evidence panel",
);
assert.match(
  dialogSource,
  /<summary>Why this recommendation\?<\/summary>/,
  "evidence panel should use user-facing explanatory copy",
);
assert.match(
  dialogSource,
  /candidate\.evidence\.map\(\(item\)/,
  "evidence panel should render each evidence item from the candidate assessment",
);
assert.match(
  dialogSource,
  /transaction-import-evidence-\$\{item\.result\}/,
  "evidence items should expose result classes for positive, neutral, and negative evidence",
);
assert.match(
  stylesSource,
  /\.transaction-import-evidence-panel/,
  "evidence panel should have dedicated styles",
);
assert.match(
  stylesSource,
  /\.transaction-import-evidence-positive/,
  "positive evidence should have a distinct style",
);
assert.match(
  stylesSource,
  /\.transaction-import-evidence-negative/,
  "negative evidence should have a distinct style",
);
assert.match(
  stylesSource,
  /\.transaction-import-evidence-neutral/,
  "neutral evidence should have a distinct style",
);

console.log("transaction intake review evidence panel checks passed");
