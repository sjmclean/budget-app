import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getPayeeSelection,
  type PayeeAutocompleteMetadata,
} from "../../../apps/web/src/features/accounts/registerPayeeAutocomplete.js";
import { buildUpdateRegisterTransactionInput } from "../../../apps/web/src/features/accounts/registerTransactionDrafts.js";
import { toTransactionWriteInput } from "../../../apps/web/src/features/accounts/useAccountRegister.js";
import type { RankedAutocompleteOption } from "../../../apps/web/src/features/ui/autocomplete/autocompleteEngine.js";

function transferSuggestion() {
  return {
    id: "transfer-savings",
    value: "Transfer: Savings",
    label: "Transfer",
    matchType: "all",
    metadata: {
      label: "Transfer",
      type: "transfer",
      transferAccountId: "savings",
    },
  } as RankedAutocompleteOption<PayeeAutocompleteMetadata>;
}

test("pointer transfer selection uses the shared typed selection boundary", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/PayeeInput.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /onMouseDown=\{\(event\)[\s\S]*?selectSuggestion\(getPayeeSelection\(suggestion\)\)/,
  );
  assert.deepEqual(getPayeeSelection(transferSuggestion()), {
    value: "Transfer: Savings",
    payeeId: undefined,
    transferAccountId: "savings",
  });
});

test("pointer transfer identity survives imported-row edit and SQLite write mapping", () => {
  const selection = getPayeeSelection(transferSuggestion());
  const update = buildUpdateRegisterTransactionInput({
    id: "imported-row",
    date: "2026-08-15",
    payee: selection.value,
    payeeId: selection.payeeId,
    transferAccountId: selection.transferAccountId,
    category: "Uncategorised",
    memo: "Imported",
    checkNumber: "",
    outflow: "25.00",
    inflow: "",
    splitLines: [],
    categoryOptions: [],
  });
  assert.ok(update);
  const write = toTransactionWriteInput(update);
  assert.equal(write.transferAccountId, "savings");
  assert.equal(write.categoryId, undefined);
});
