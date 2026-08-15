import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRegisterTransactionDraft,
} from "../../../apps/web/src/features/accounts/registerTransactionValidation.js";
import { isUncategorisedRegisterTransaction } from "../../../apps/web/src/features/accounts/registerUncategorised.js";
import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";

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


function row(overrides: Partial<RegisterTransactionView>): RegisterTransactionView {
  return {
    id: "row",
    date: "2026-08-15",
    attachmentCount: 0,
    payee: "Example",
    category: "Uncategorised",
    inflow: 0,
    outflow: 1,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
    ...overrides,
  };
}

test("category attention is sign-symmetric and excludes zero-value and off-budget rows", () => {
  assert.equal(isUncategorisedRegisterTransaction(row({ outflow: 1 })), true);
  assert.equal(isUncategorisedRegisterTransaction(row({ outflow: 0, inflow: 1 })), true);
  assert.equal(isUncategorisedRegisterTransaction(row({ outflow: 0, inflow: 0 })), false);
  assert.equal(
    isUncategorisedRegisterTransaction(row({ outflow: 1 }), {
      accountParticipation: "off-budget",
    }),
    false,
  );
  assert.equal(
    isUncategorisedRegisterTransaction(row({
      outflow: 0,
      inflow: 1,
      category: "Ready to Assign",
      categoryId: "__ready_to_assign__",
    })),
    false,
  );
});

test("transfer attention follows the budget boundary and never display text", () => {
  assert.equal(isUncategorisedRegisterTransaction(row({
    payee: "Transfer: Savings",
    transferAccountId: "savings",
    transferTransactionId: "other-leg",
    transferAccountParticipation: "on-budget",
  })), false);
  assert.equal(isUncategorisedRegisterTransaction(row({
    payee: "Transfer: Mortgage",
    transferAccountId: "mortgage",
    transferTransactionId: "other-leg",
    transferAccountParticipation: "off-budget",
  })), true);
  assert.equal(isUncategorisedRegisterTransaction(row({
    payee: "Transfer: Savings",
  })), true);
});

test("split attention examines every financially relevant line", () => {
  const split = (overrides: Record<string, unknown>) => ({
    id: String(overrides.id ?? "split"),
    category: "Uncategorised",
    inflow: 0,
    outflow: 10,
    ...overrides,
  });
  assert.equal(isUncategorisedRegisterTransaction(row({
    splitLines: [
      split({ id: "categorised", category: "Food", categoryId: "food" }),
      split({ id: "missing" }),
    ],
  })), true);
  assert.equal(isUncategorisedRegisterTransaction(row({
    splitLines: [
      split({
        id: "internal-transfer",
        transferAccountId: "savings",
        transferTransactionId: "split-leg",
        transferAccountParticipation: "on-budget",
      }),
    ],
  })), false);
  assert.equal(isUncategorisedRegisterTransaction(row({
    splitLines: [
      split({
        id: "boundary-transfer",
        transferAccountId: "mortgage",
        transferTransactionId: "split-leg",
        transferAccountParticipation: "off-budget",
      }),
    ],
  })), true);
});
