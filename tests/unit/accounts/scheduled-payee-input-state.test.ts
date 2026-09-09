import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyScheduledPayeeText,
  applyScheduledSavedPayee,
  applyScheduledTransferAccount,
  type ScheduledPayeeDraftState,
} from "../../../apps/web/src/features/accounts/scheduledPayeeDraft";

type Draft = ScheduledPayeeDraftState & { untouched: string };

function draft(
  overrides: Partial<ScheduledPayeeDraftState> = {},
): Draft {
  return {
    payee: "",
    payeeId: undefined,
    transferAccountId: undefined,
    untouched: "preserved",
    ...overrides,
  };
}

function typePayee(current: Draft, value: string): Draft {
  let next = applyScheduledPayeeText(current, value);
  next = applyScheduledSavedPayee(next, undefined, undefined);
  next = applyScheduledTransferAccount(next, undefined);
  return next;
}

test("free typing retains text and clears stale payee identities", () => {
  assert.deepEqual(typePayee(draft(), "W"), draft({ payee: "W" }));
  assert.deepEqual(
    typePayee(draft({ payee: "Old", payeeId: "payee-old" }), "New"),
    draft({ payee: "New" }),
  );
  assert.deepEqual(
    typePayee(
      draft({
        payee: "Transfer: Savings",
        transferAccountId: "account-savings",
      }),
      "Coffee",
    ),
    draft({ payee: "Coffee" }),
  );
});

test("saved payee selection survives the PayeeInput callback sequence", () => {
  let next = applyScheduledPayeeText(draft(), "Known Payee");
  next = applyScheduledSavedPayee(next, "payee-known", "Known Payee");
  next = applyScheduledTransferAccount(next, undefined);

  assert.deepEqual(
    next,
    draft({ payee: "Known Payee", payeeId: "payee-known" }),
  );
});

test("transfer selection preserves display text and transfer identity", () => {
  let next = applyScheduledPayeeText(draft(), "Transfer: Savings");
  next = applyScheduledSavedPayee(next, undefined, undefined);
  next = applyScheduledTransferAccount(next, "account-savings");

  assert.deepEqual(
    next,
    draft({
      payee: "Transfer: Savings",
      transferAccountId: "account-savings",
    }),
  );
});

test("scheduled form applies PayeeInput callbacks as functional updates", () => {
  const panel = readFileSync(
    new URL(
      "../../../apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    panel,
    /onChange=\{\(payee\)[\s\S]*?setDraft\(\(current\) =>[\s\S]*?applyScheduledPayeeText/,
  );
  assert.match(
    panel,
    /onTransferAccountIdChange=\{\(transferAccountId\)[\s\S]*?applyScheduledTransferAccount/,
  );
  assert.match(
    panel,
    /onPayeeIdChange=\{\(payeeId\)[\s\S]*?applyScheduledSavedPayee/,
  );
});
