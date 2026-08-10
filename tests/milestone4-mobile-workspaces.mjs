import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [editor, budgetStyles, registerStyles] = await Promise.all([
  readFile("apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx", "utf8"),
  readFile("apps/web/src/styles/globals.css", "utf8"),
  readFile("apps/web/src/styles/register.css", "utf8"),
]);

assert.match(editor, /if \(layoutMode === "mobile"\)/);
assert.match(editor, /mobile-transaction-sheet mobile-transaction-step-/);
assert.match(editor, /aria-modal="true"/);
assert.match(editor, /mobile-transaction-keypad/);
assert.match(editor, /mobilePicker/);
assert.match(editor, /setMobilePicker\("date"\)/);
assert.match(editor, /setMobilePicker\("payee"\)/);
assert.match(editor, /setMobilePicker\("category"\)/);
assert.match(editor, /setMobilePicker\("account"\)/);
assert.match(editor, /setMobilePicker\("splits"\)/);
assert.match(editor, /mobilePositiveSplitIds/);
assert.match(editor, /finishMobileSplits/);
assert.match(editor, /Split \(\$\{completedMobileSplits\.length\}/);
assert.match(editor, /mobile-split-sign-positive/);
assert.match(editor, /createPortal/);
assert.match(editor, /window\.visualViewport/);

assert.match(budgetStyles, /@media \(max-width: 600px\)/);
assert.match(budgetStyles, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+5\.6rem\s+5\.6rem/);
assert.match(budgetStyles, /container-name:\s*budget-workspace-main/);
assert.match(budgetStyles, /@container budget-workspace-main \(max-width:\s*44rem\)/);
assert.match(
  budgetStyles,
  /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(17rem,\s*20rem\)/,
);
assert.match(
  budgetStyles,
  /grid-template-areas:\s*"title summary"\s*"month summary"\s*"tabs summary"\s*"toolbar toolbar"/,
);
assert.doesNotMatch(budgetStyles, /"tabs tabs summary"/);
assert.doesNotMatch(budgetStyles, /"toolbar toolbar toolbar"/);
assert.doesNotMatch(
  budgetStyles,
  /grid-template-columns:\s*minmax\(12rem,\s*1fr\)\s+auto\s+minmax\(17rem,\s*1fr\)/,
);

assert.match(registerStyles, /\.mobile-transaction-keypad/);
assert.match(registerStyles, /\.mobile-picker-list/);
assert.match(registerStyles, /\.mobile-date-picker/);
assert.match(registerStyles, /\.mobile-split-row/);
assert.match(registerStyles, /\.mobile-split-sign-positive/);

console.log("Milestone 4 mobile budget and transaction workspace contracts passed.");
