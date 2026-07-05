import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesSource = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(
  stylesSource,
  /\.transaction-import-evidence-positive \.transaction-import-evidence-marker/,
  "positive evidence markers should have dedicated styling",
);
assert.match(
  stylesSource,
  /\.transaction-import-evidence-negative \.transaction-import-evidence-marker/,
  "negative evidence markers should have dedicated styling",
);
assert.match(
  stylesSource,
  /\.transaction-import-evidence-neutral \.transaction-import-evidence-marker/,
  "neutral evidence markers should have dedicated styling",
);

console.log("transaction intake review styling checks passed");
