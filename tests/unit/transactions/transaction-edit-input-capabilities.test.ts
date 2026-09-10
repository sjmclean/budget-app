import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldOpenPayeeSuggestionsOnFocus } from "../../../apps/web/src/features/accounts/components/PayeeInput";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const dateField = read(
  "apps/web/src/features/accounts/components/RegisterDateField.tsx",
);
const payeeInput = read(
  "apps/web/src/features/accounts/components/PayeeInput.tsx",
);
const categoryInput = read(
  "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
);
const moneyInput = read(
  "apps/web/src/features/money/MoneyInput.tsx",
);

test("shared transaction inputs expose initial replacement selection capability", () => {
  for (const [name, source] of [
    ["date", dateField],
    ["payee", payeeInput],
    ["category", categoryInput],
    ["money", moneyInput],
  ] as const) {
    assert.match(
      source,
      /selectOnInitialFocus\??:\s*boolean/,
      `${name} input should expose selectOnInitialFocus`,
    );
    assert.match(
      source,
      /initialSelectionPending/,
      `${name} input should track one-shot selection`,
    );
    assert.match(
      source,
      /\.select\(\)/,
      `${name} input should select the editable value`,
    );
  }
});

test("payee preserves suggestion opening independently of initial selection", () => {
  assert.equal(
    shouldOpenPayeeSuggestionsOnFocus({
      value: "",
      openOnFocus: false,
      openWhenEmptyOnFocus: true,
    }),
    true,
    "empty payee inputs should keep the backwards-compatible focus-open default",
  );
  assert.equal(
    shouldOpenPayeeSuggestionsOnFocus({
      value: "Existing payee",
      openOnFocus: true,
      openWhenEmptyOnFocus: false,
    }),
    true,
    "openOnFocus should open suggestions independently of the input value",
  );
  assert.equal(
    shouldOpenPayeeSuggestionsOnFocus({
      value: "",
      openOnFocus: false,
      openWhenEmptyOnFocus: false,
    }),
    false,
    "consumers should be able to keep an empty auto-focused input collapsed",
  );

  assert.match(payeeInput, /openWhenEmptyOnFocus = true/);
  assert.match(
    payeeInput,
    /shouldOpenPayeeSuggestionsOnFocus\(\{\s*value,\s*openOnFocus,\s*openWhenEmptyOnFocus,\s*\}\)/,
  );
  assert.match(
    payeeInput,
    /if \(initialSelectionPending\.current\) \{[\s\S]*?\.select\(\)[\s\S]*?\}[\s\S]*?shouldOpenPayeeSuggestionsOnFocus/,
    "one-shot text selection should remain separate from suggestion opening",
  );
});

test("category preserves its existing autofocus replacement behaviour", () => {
  assert.match(
    categoryInput,
    /selectOnInitialFocus = autoFocus/,
  );
  assert.match(
    categoryInput,
    /openSuggestionList\(openOnFocus \|\| value\.trim\(\)\.length === 0\)/,
  );
});

test("money selection remains inside the existing money edit lifecycle", () => {
  const beginIndex = moneyInput.indexOf("beginMoneyInputEdit(current, value, display)");
  const selectIndex = moneyInput.indexOf("event.currentTarget.select()");

  assert.notEqual(beginIndex, -1);
  assert.notEqual(selectIndex, -1);
  assert.ok(
    beginIndex < selectIndex,
    "money edit session should begin before initial value selection",
  );
});
