import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const payeeInputSource = readFileSync(
  "apps/web/src/features/accounts/components/PayeeInput.tsx",
  "utf8",
);
const categoryInputSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  "utf8",
);
const registerEditorSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const registerCssSource = readFileSync("apps/web/src/styles/register.css", "utf8");

for (const [name, source] of [
  ["payee", payeeInputSource],
  ["category", categoryInputSource],
] as const) {
  assert.match(
    source,
    /className="register-combobox-arrow"/,
    `${name} editor field should expose a permanent dropdown arrow`,
  );

  assert.match(
    source,
    /openSuggestionList\(true\)/,
    `${name} dropdown arrow should open the full choice list`,
  );

  assert.match(
    source,
    /showAllSuggestions \|\| value\.trim\(\)\.length === 0[\s\S]*autocompleteOptions\.map/,
    `${name} dropdown should show the complete unfiltered choice list when opened from the arrow or empty-field workflow`,
  );

  assert.match(
    source,
    /maxResults: 8/,
    `${name} typed filtering should still use the compact ranked suggestion list`,
  );

  assert.match(
    source,
    /role="listbox"/,
    `${name} choices should remain exposed as a selectable listbox`,
  );
}

assert.match(
  categoryInputSource,
  /openOnFocus[\s\S]*openSuggestionList\(true\)/,
  "category auto-focus from the uncategorised chip should open the full category list",
);

assert.match(
  categoryInputSource,
  /filter\(\(category\) => !category\.isArchived\)/,
  "category choices should exclude archived or hidden categories",
);

assert.match(
  categoryInputSource,
  /showAllSuggestions \|\| value\.trim\(\)\.length === 0/,
  "empty category dropdowns should show all available categories, not a shortened subset",
);

assert.match(
  categoryInputSource,
  /autocompleteOptions\.map\(\(option\) =>/,
  "full category dropdowns should preserve budget group/category order instead of re-ranking categories and repeating group headings",
);

assert.match(
  registerEditorSource,
  /<PayeeInput[\s\S]*payeeOptions=\{payeeOptions\}/,
  "register editor should continue using the shared PayeeInput combobox",
);

assert.match(
  registerEditorSource,
  /<RegisterCategoryInput[\s\S]*categoryOptions=\{categoryOptions\}/,
  "register editor should continue using the shared RegisterCategoryInput combobox",
);

assert.match(
  registerEditorSource,
  /openOnFocus=\{autoFocusField === "category"\}/,
  "uncategorised chip focus should still open category choices immediately",
);

assert.match(
  registerCssSource,
  /\.register-combobox-arrow/,
  "register combobox arrow should have dedicated styling",
);

assert.match(
  registerCssSource,
  /\.register-category-suggestions \.register-autocomplete-section-heading[\s\S]*background: color-mix\(in srgb, var\(--surface-subtle\) 92%, var\(--surface\)\)/,
  "category group headings should use subtle register-style shaded separators",
);

console.log("v2.63.7 register editor combobox dropdown checks passed");
