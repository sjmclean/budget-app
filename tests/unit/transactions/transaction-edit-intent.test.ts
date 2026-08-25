import assert from "node:assert/strict";
import test from "node:test";

import {
  TRANSACTION_EDITABLE_FIELDS,
  getTransactionFieldEditBehaviour,
  type TransactionEditableField,
} from "../../../apps/web/src/features/transactions/transactionEditIntent.js";

const chooserFields = new Set<TransactionEditableField>([
  "payee",
  "category",
]);

test("transaction edit fields define the complete shared editing surface", () => {
  assert.deepEqual(
    TRANSACTION_EDITABLE_FIELDS,
    [
      "date",
      "payee",
      "category",
      "memo",
      "checkNumber",
      "outflow",
      "inflow",
    ],
  );
});

for (const field of TRANSACTION_EDITABLE_FIELDS) {
  test(`${field} receives replacement behaviour when it owns edit intent`, () => {
    assert.deepEqual(
      getTransactionFieldEditBehaviour({ field }, field),
      {
        autoFocus: true,
        selectOnInitialFocus: true,
        openOnFocus: chooserFields.has(field),
      },
    );
  });

  test(`${field} remains inactive when another field owns edit intent`, () => {
    const otherField =
      field === "date"
        ? "payee"
        : "date";

    assert.deepEqual(
      getTransactionFieldEditBehaviour({ field: otherField }, field),
      {
        autoFocus: false,
        selectOnInitialFocus: false,
        openOnFocus: false,
      },
    );
  });
}

test("no edit intent leaves every transaction field inactive", () => {
  for (const field of TRANSACTION_EDITABLE_FIELDS) {
    assert.deepEqual(
      getTransactionFieldEditBehaviour(null, field),
      {
        autoFocus: false,
        selectOnInitialFocus: false,
        openOnFocus: false,
      },
    );
  }
});
