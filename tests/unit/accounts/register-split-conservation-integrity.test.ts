import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRegisterTransactionDraft,
} from "../../../apps/web/src/features/accounts/registerTransactionValidation.js";

test("split validation rejects opposite-side amounts that break signed parent conservation", () => {
  const result = validateRegisterTransactionDraft({
    payee: "Split purchase",
    outflow: "100.00",
    inflow: "",
    categoryOptions: [],
    splitLines: [
      {
        id: "split-outflow",
        category: "Groceries",
        memo: "",
        outflow: "100.00",
        inflow: "",
      },
      {
        id: "split-inflow",
        category: "Refund",
        memo: "",
        outflow: "",
        inflow: "50.00",
      },
    ],
  });

  assert.equal(
    result.isValid,
    false,
    "signed split amounts must conserve the parent transaction amount",
  );

  assert.equal(
    result.reason,
    "unbalanced-split-lines",
  );
});

test("split validation rejects opposite-side outflow on an inflow parent", () => {
  const result = validateRegisterTransactionDraft({
    payee: "Split refund",
    outflow: "",
    inflow: "100.00",
    categoryOptions: [],
    splitLines: [
      {
        id: "split-inflow",
        category: "Refund",
        memo: "",
        outflow: "",
        inflow: "100.00",
      },
      {
        id: "split-outflow",
        category: "Fee",
        memo: "",
        outflow: "25.00",
        inflow: "",
      },
    ],
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, "unbalanced-split-lines");
});
