import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync("apps/web/src/features/accounts/components/TransactionImportDialog.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(dialog, /Destination account/);
assert.match(dialog, /transaction-import-stepper/);
assert.match(dialog, /Review QIF file interpretation/);
assert.match(dialog, /CSV columns were detected automatically/);
assert.match(dialog, /Reset Auto Mapping/);
assert.match(dialog, /File Settings/);
assert.match(dialog, /Possible Register Match/);
assert.match(dialog, /New Transaction/);
assert.match(dialog, /New Transfer/);
assert.match(dialog, /Invalid Import Data/);
assert.match(dialog, /Edit Payee/);
assert.match(dialog, /Edit Category/);
assert.match(dialog, /Use Existing/);
assert.match(dialog, /Import as New/);
assert.match(dialog, /Import Transfer/);
assert.doesNotMatch(dialog, /Double-click the payee or category/);
assert.doesNotMatch(dialog, /title="Double-click to change/);
assert.doesNotMatch(dialog, /event\.key !== "Enter"/);
assert.match(css, /transaction-import-review-card-new/);
assert.match(css, /transaction-import-review-card-exact-match/);
assert.match(css, /transaction-import-review-card-invalid/);
assert.match(dialog, /money-positive/);
assert.match(dialog, /money-negative/);

console.log("v3.22.8 import review UI redesign structure tests passed");
