import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const payeeInputSource = readFileSync(
  "apps/web/src/features/accounts/components/PayeeInput.tsx",
  "utf8",
);

function testExtractionBoundary() {
  assert.match(
    editorSource,
    /import \{ PayeeInput \} from "\.\/PayeeInput";/,
    "RegisterTransactionEditor should import the extracted PayeeInput component",
  );
  assert.doesNotMatch(
    editorSource,
    /function PayeeInput\(/,
    "RegisterTransactionEditor should not define PayeeInput inline",
  );
  assert.match(
    payeeInputSource,
    /export function PayeeInput\(/,
    "PayeeInput should be exported from its own component module",
  );
}

function testPayeeInputKeepsAutocompleteBehaviour() {
  assert.match(
    payeeInputSource,
    /buildPayeeAutocompleteOptions\(\{ transferAccounts, payeeOptions \}\)/,
    "PayeeInput should keep building autocomplete options from transfer accounts and payees",
  );
  assert.match(
    payeeInputSource,
    /rankAutocompleteOptions\(\{[\s\S]*maxResults: 8,/,
    "PayeeInput should preserve the existing suggestion limit",
  );
  assert.match(
    payeeInputSource,
    /getAutocompleteCompletion\(/,
    "PayeeInput should preserve ghost-text completion behaviour",
  );
  assert.match(
    payeeInputSource,
    /useRegisterAutocompletePopupStyle\(/,
    "PayeeInput should keep using the shared popup positioning hook",
  );
}

function testPayeeInputKeepsKeyboardBehaviour() {
  assert.match(
    payeeInputSource,
    /event\.key === "Tab" && !event\.shiftKey && shouldShowGhost/,
    "PayeeInput should keep accepting ghost suggestions with Tab",
  );
  assert.match(
    payeeInputSource,
    /event\.key === "ArrowRight" && shouldShowGhost/,
    "PayeeInput should keep accepting ghost suggestions with ArrowRight",
  );
  assert.match(
    payeeInputSource,
    /event\.key === "ArrowDown" && suggestions\.length > 0/,
    "PayeeInput should keep ArrowDown suggestion navigation",
  );
  assert.match(
    payeeInputSource,
    /event\.key === "Enter"/,
    "PayeeInput should keep Enter selection behaviour",
  );
  assert.match(
    payeeInputSource,
    /event\.key === "Escape"/,
    "PayeeInput should keep Escape closing behaviour",
  );
}

function testPayeeInputKeepsRenderedSemantics() {
  assert.match(
    payeeInputSource,
    /placeholder="Payee"/,
    "PayeeInput should preserve the Payee placeholder",
  );
  assert.match(
    payeeInputSource,
    /aria-autocomplete="list"/,
    "PayeeInput should preserve autocomplete accessibility metadata",
  );
  assert.match(
    payeeInputSource,
    /role="listbox"/,
    "PayeeInput should preserve the suggestions listbox role",
  );
  assert.match(
    payeeInputSource,
    /role="option"/,
    "PayeeInput should preserve suggestion option roles",
  );
}

function run() {
  testExtractionBoundary();
  testPayeeInputKeepsAutocompleteBehaviour();
  testPayeeInputKeepsKeyboardBehaviour();
  testPayeeInputKeepsRenderedSemantics();
  console.log("v2.60.6 register payee input extraction checks passed");
}

run();
