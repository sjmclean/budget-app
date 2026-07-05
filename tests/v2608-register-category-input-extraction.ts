import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function testExtractionBoundary() {
  const editorSource = read(
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  );
  const categoryInputSource = read(
    "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  );

  assert.match(
    editorSource,
    /import \{ RegisterCategoryInput \} from "\.\/RegisterCategoryInput";/,
    "RegisterTransactionEditor should import the extracted category input component",
  );
  assert.doesNotMatch(
    editorSource,
    /function CategoryInput\(/,
    "RegisterTransactionEditor should no longer own the category autocomplete component",
  );
  assert.match(
    categoryInputSource,
    /export function RegisterCategoryInput\(/,
    "RegisterCategoryInput should be exported from its own module",
  );
}

function testAutocompleteBehaviourWasPreserved() {
  const categoryInputSource = read(
    "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  );

  assert.match(
    categoryInputSource,
    /value: SPLIT_CATEGORY_LABEL/,
    "Category autocomplete should still include the Split option when enabled",
  );
  assert.match(
    categoryInputSource,
    /includeSplitOption = true/,
    "Split option should remain enabled by default",
  );
  assert.match(
    categoryInputSource,
    /normalise: normaliseCategoryName/,
    "Category autocomplete should preserve category-name normalisation",
  );
  assert.match(
    categoryInputSource,
    /placeholder="Category"/,
    "Category input placeholder should remain unchanged",
  );
  assert.match(
    categoryInputSource,
    /className="register-payee-suggestions register-autocomplete-popup register-category-suggestions"/,
    "Category suggestions should keep the existing styling hooks",
  );
}

function testEditorStillUsesCategoryInputEverywhere() {
  const editorSource = read(
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  );
  const usages = editorSource.match(/<RegisterCategoryInput/g) ?? [];

  assert.equal(
    usages.length,
    5,
    "RegisterTransactionEditor should use RegisterCategoryInput for entry, edit, and split category fields",
  );
  assert.match(
    editorSource,
    /includeSplitOption=\{false\}/,
    "Split line category inputs should still suppress nested Split suggestions",
  );
}

function run() {
  testExtractionBoundary();
  testAutocompleteBehaviourWasPreserved();
  testEditorStillUsesCategoryInputEverywhere();
  console.log("v2.60.8 register category input extraction checks passed");
}

run();
