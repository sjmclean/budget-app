import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyScheduledPayeeText,
  applyScheduledSavedPayee,
  applyScheduledTransferAccount,
  type ScheduledPayeeDraftState,
} from "../../../apps/web/src/features/accounts/scheduledPayeeDraft";
import { shouldOpenPayeeSuggestionsOnFocus } from "../../../apps/web/src/features/accounts/components/PayeeInput";

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

test("saved payee selection applies only a valid active default category", () => {
  const categories = [
    { id: "category-food", name: "Food" },
    { id: "category-old", name: "Old category", isArchived: true },
  ];

  assert.deepEqual(
    applyScheduledSavedPayee(
      draft({ category: "Bills", categoryId: "category-bills" }),
      "payee-known",
      "Known Payee",
      "category-food",
      "Food",
      categories,
    ),
    draft({
      payee: "Known Payee",
      payeeId: "payee-known",
      category: "Food",
      categoryId: "category-food",
    }),
  );

  for (const [categoryId, categoryName] of [
    ["category-missing", "Missing"],
    ["category-old", "Old category"],
    ["category-food", "Stale name"],
  ] as const) {
    const current = draft({ category: "Bills", categoryId: "category-bills" });
    const next = applyScheduledSavedPayee(
      current,
      "payee-known",
      "Known Payee",
      categoryId,
      categoryName,
      categories,
    );
    assert.equal(next.category, "Bills");
    assert.equal(next.categoryId, "category-bills");
  }
});

test("saved payee defaults never overwrite split drafts", () => {
  const current = draft({
    category: "Split",
    splitLines: [{ id: "split-1" }],
  });
  const next = applyScheduledSavedPayee(
    current,
    "payee-known",
    "Known Payee",
    "category-food",
    "Food",
    [{ id: "category-food", name: "Food" }],
  );

  assert.equal(next.category, "Split");
  assert.equal(next.categoryId, undefined);
  assert.equal(next.splitLines, current.splitLines);
});

test("manual category overrides remain until another saved payee is explicitly selected", () => {
  const categories = [
    { id: "category-food", name: "Food" },
    { id: "category-travel", name: "Travel" },
  ];
  let next = applyScheduledSavedPayee(
    draft(),
    "payee-a",
    "Payee A",
    "category-food",
    "Food",
    categories,
  );

  next = { ...next, category: "Travel", categoryId: "category-travel" };
  assert.equal(next.category, "Travel");
  assert.equal(next.categoryId, "category-travel");

  next = applyScheduledSavedPayee(
    next,
    "payee-b",
    "Payee B",
    "category-food",
    "Food",
    categories,
  );
  assert.equal(next.category, "Food");
  assert.equal(next.categoryId, "category-food");
});

test("typing and transfer selection do not apply a payee default category", () => {
  const current = draft({ category: "Bills", categoryId: "category-bills" });
  assert.equal(applyScheduledPayeeText(current, "Free text").category, "Bills");
  assert.equal(
    applyScheduledTransferAccount(current, "account-savings").category,
    "Bills",
  );
});

test("scheduled auto-focus leaves payee suggestions collapsed", () => {
  assert.equal(
    shouldOpenPayeeSuggestionsOnFocus({
      value: "",
      openOnFocus: false,
      openWhenEmptyOnFocus: false,
    }),
    false,
  );
  assert.equal(
    shouldOpenPayeeSuggestionsOnFocus({
      value: "",
      openOnFocus: false,
      openWhenEmptyOnFocus: true,
    }),
    true,
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
  assert.match(panel, /openWhenEmptyOnFocus=\{false\}/);
  assert.match(
    panel,
    /applyScheduledSavedPayee\([\s\S]*?selectedPayee\?\.defaultCategoryId[\s\S]*?selectedPayee\?\.defaultCategoryName[\s\S]*?categoryOptions/,
  );
});

test("scheduled attachment surface uses theme tokens", () => {
  const styles = readFileSync(
    new URL("../../../apps/web/src/styles/register.css", import.meta.url),
    "utf8",
  );
  const section = styles.match(
    /\.scheduled-attachment-section\s*\{([^}]*)\}/,
  )?.[1];

  assert.ok(section);
  assert.match(section, /background:\s*var\(--surface\)/);
  assert.match(section, /color:\s*var\(--text\)/);
  assert.doesNotMatch(section, /background:\s*#fff/);
});
