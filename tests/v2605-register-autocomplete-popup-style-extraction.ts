import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const hookSource = readFileSync(
  "apps/web/src/features/accounts/useRegisterAutocompletePopupStyle.ts",
  "utf8",
);

function testExtractionBoundary() {
  assert.match(
    editorSource,
    /import \{ useRegisterAutocompletePopupStyle \} from "\.\.\/useRegisterAutocompletePopupStyle";/,
    "RegisterTransactionEditor should import the extracted popup style hook",
  );
  assert.doesNotMatch(
    editorSource,
    /function useRegisterAutocompletePopupStyle\(/,
    "RegisterTransactionEditor should not define the popup style hook inline",
  );
  assert.match(
    editorSource,
    /const \{ anchorRef, popupStyle \} = useRegisterAutocompletePopupStyle\(/,
    "RegisterTransactionEditor should keep using the popup style hook",
  );
}

function testHookPreservesPopupPositioningBehaviour() {
  assert.match(
    hookSource,
    /useRef<HTMLInputElement \| null>\(null\)/,
    "The extracted hook should keep an input anchor ref",
  );
  assert.match(
    hookSource,
    /left: rect\.left/,
    "The extracted hook should position the popup from the anchor left edge",
  );
  assert.match(
    hookSource,
    /minWidth: Math\.max\(rect\.width, 384\)/,
    "The extracted hook should preserve the 384px minimum popup width",
  );
  assert.match(
    hookSource,
    /position: "fixed"/,
    "The extracted hook should keep fixed popup positioning",
  );
  assert.match(
    hookSource,
    /top: rect\.bottom \+ 4/,
    "The extracted hook should preserve the 4px vertical offset",
  );
}

function testHookPreservesEventListeners() {
  assert.match(
    hookSource,
    /window\.addEventListener\("resize", updatePopupStyle\)/,
    "The extracted hook should reposition on resize",
  );
  assert.match(
    hookSource,
    /window\.addEventListener\("scroll", updatePopupStyle, true\)/,
    "The extracted hook should reposition on captured scroll events",
  );
  assert.match(
    hookSource,
    /window\.removeEventListener\("resize", updatePopupStyle\)/,
    "The extracted hook should remove the resize listener",
  );
  assert.match(
    hookSource,
    /window\.removeEventListener\("scroll", updatePopupStyle, true\)/,
    "The extracted hook should remove the scroll listener",
  );
}

function run() {
  testExtractionBoundary();
  testHookPreservesPopupPositioningBehaviour();
  testHookPreservesEventListeners();
  console.log("v2.60.5 register autocomplete popup style extraction checks passed");
}

run();
