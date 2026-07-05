import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function testPayeeAutocompleteHelpersAreExtracted() {
  const editorSource = read(
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  );
  const helperSource = read("apps/web/src/features/accounts/registerPayeeAutocomplete.ts");

  assert.match(
    editorSource,
    /from "\.\.\/registerPayeeAutocomplete"/,
    "RegisterTransactionEditor should import payee autocomplete helpers",
  );
  assert.match(
    editorSource,
    /buildPayeeAutocompleteOptions\(\{ transferAccounts, payeeOptions \}\)/,
    "RegisterTransactionEditor should delegate payee option construction",
  );
  assert.doesNotMatch(
    editorSource,
    /function getPayeeSuggestionSection/,
    "RegisterTransactionEditor should not own payee suggestion section logic",
  );
  assert.doesNotMatch(
    editorSource,
    /function getPayeeSuggestionText/,
    "RegisterTransactionEditor should not own payee suggestion display text logic",
  );

  assert.match(
    helperSource,
    /export function buildPayeeAutocompleteOptions/,
    "Payee autocomplete option construction should live in the helper module",
  );
  assert.match(
    helperSource,
    /return suggestion\.metadata\?\.type === "transfer" \? "Transfers" : "Payees"/,
    "Payee helper should preserve suggestion section labels",
  );
  assert.match(
    helperSource,
    /replace\(\/\^Transfer:\\s\*\/i, ""\)/,
    "Payee helper should preserve transfer display text cleanup",
  );
}

function run() {
  testPayeeAutocompleteHelpersAreExtracted();
  console.log("v2.60.2 register payee autocomplete extraction checks passed");
}

run();
