import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(dialog, /transaction-import-review-card-processing/);
assert.match(dialog, /window\.setTimeout\(\(\) => \{/);
assert.match(dialog, /data-import-candidate-card/);
assert.match(dialog, /event\.key === "ArrowDown"/);
assert.match(dialog, /event\.key === "Escape"/);
assert.match(dialog, /Discard Import Session/);
assert.match(dialog, /Discard this import session\?/);
assert.match(dialog, /Review complete/);
assert.match(dialog, /Commit Import/);
assert.doesNotMatch(dialog, /Start Over/);
assert.doesNotMatch(dialog, /readyCount/);
assert.doesNotMatch(dialog, /attentionCount/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(styles, /transaction-import-editor-expand/);
assert.match(styles, /transaction-import-history-pulse/);

console.log("v3.18.0 importer polish checks passed");
