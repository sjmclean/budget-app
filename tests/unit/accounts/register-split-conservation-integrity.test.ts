import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRegisterTransactionDraft,
} from "../../../apps/web/src/features/accounts/registerTransactionValidation.js";
import { isUncategorisedRegisterTransaction } from "../../../apps/web/src/features/accounts/registerUncategorised.js";
import {
  buildNewRegisterTransactionInput,
  buildUpdateRegisterTransactionInput,
} from "../../../apps/web/src/features/accounts/registerTransactionDrafts.js";
import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  splitDraftsFromTransaction,
} from "../../../apps/web/src/features/accounts/registerSplitDrafts.js";
import {
  resolveRegisterTransactionCategory,
  resolveRegisterTransactionEditCategory,
  SPLIT_CATEGORY_LABEL,
} from "../../../apps/web/src/features/accounts/registerCategoryMatching.js";

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
  assert.equal(isUncategorisedRegisterTransaction(row({
    transferAccountId: "savings",
    transferAccountParticipation: "on-budget",
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
        id: "dangling-transfer",
        transferAccountId: "savings",
        transferAccountParticipation: "on-budget",
      }),
    ],
  })), true);
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

test("new inflows default to Ready to Assign without recategorising imported unresolved edits", () => {
  const common = {
    date: "2026-08-15", payee: "Employer", memo: "", checkNumber: "",
    outflow: "", inflow: "100.00", splitLines: [],
    categoryOptions: [{
      id: "__ready_to_assign__", name: "Ready to Assign",
      groupName: "Income", archived: false,
    }],
  };
  assert.equal(
    buildNewRegisterTransactionInput({ ...common, category: "" })?.categoryId,
    "__ready_to_assign__",
  );
  const edited = buildUpdateRegisterTransactionInput({
    ...common, id: "imported-income", category: "Uncategorised",
  });
  assert.equal(edited?.category, "Uncategorised");
  assert.equal(edited?.categoryId, undefined);
  assert.equal(
    buildUpdateRegisterTransactionInput({
      ...common, id: "imported-income", category: "Ready to Assign",
    })?.categoryId,
    "__ready_to_assign__",
  );
});

test("split structure takes precedence over a missing parent category", () => {
  assert.equal(
    resolveRegisterTransactionCategory({
      splitLineCount: 10,
      categoryId: null,
      categoryName: null,
      transferAccountId: null,
    }),
    SPLIT_CATEGORY_LABEL,
  );

  assert.equal(
    resolveRegisterTransactionEditCategory(
      "Uncategorised",
      10,
    ),
    SPLIT_CATEGORY_LABEL,
  );
});

test("editing a ten-line split preserves every split and emits a split parent", () => {
  const splitLines = Array.from(
    { length: 10 },
    (_, index) => ({
      id: `split-${index + 1}`,
      category: `Category ${index + 1}`,
      categoryId: `category-${index + 1}`,
      memo: `Split ${index + 1}`,
      inflow: 10,
      outflow: 0,
    }),
  );

  const transaction = row({
    id: "ten-line-split",
    payee: "Department Of Education",
    category: "Uncategorised",
    categoryId: undefined,
    inflow: 100,
    outflow: 0,
    splitLines,
  });

  const drafts = splitDraftsFromTransaction(transaction);

  assert.equal(
    drafts.length,
    10,
    "opening edit must hydrate every persisted split line",
  );

  assert.deepEqual(
    drafts.map(({ id }) => id),
    splitLines.map(({ id }) => id),
    "split identity and ordering must survive edit hydration",
  );

  const categoryOptions = splitLines.map((line) => ({
    id: line.categoryId!,
    name: line.category,
    groupName: "Test",
    archived: false,
  }));

  const updated = buildUpdateRegisterTransactionInput({
    id: transaction.id,
    date: transaction.date,
    payee: transaction.payee,
    category: resolveRegisterTransactionEditCategory(
      transaction.category,
      drafts.length,
    ),
    memo: transaction.memo ?? "",
    checkNumber: transaction.checkNumber ?? "",
    outflow: "",
    inflow: "100.00",
    splitLines: drafts,
    categoryOptions,
  });

  assert.ok(updated);
  assert.equal(updated.category, "Split");
  assert.equal(updated.categoryId, undefined);
  assert.equal(
    updated.splitLines?.length,
    10,
    "saving an unchanged split must emit every hydrated split line",
  );

  assert.deepEqual(
    updated.splitLines?.map(({ id }) => id),
    splitLines.map(({ id }) => id),
    "save must preserve split identity and ordering",
  );
});
