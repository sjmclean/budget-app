import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isUncategorisedRegisterTransaction } from "../apps/web/src/features/accounts/registerUncategorised";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";

function transaction(
  overrides: Partial<RegisterTransactionView> = {},
): RegisterTransactionView {
  return {
    id: overrides.id ?? "txn-1",
    date: overrides.date ?? "2026-07-07",
    flag: overrides.flag ?? null,
    attachmentCount: overrides.attachmentCount ?? 0,
    payee: overrides.payee ?? "Aldi",
    payeeId: overrides.payeeId,
    category: overrides.category ?? "",
    categoryId: overrides.categoryId,
    memo: overrides.memo,
    checkNumber: overrides.checkNumber,
    inflow: overrides.inflow ?? 0,
    outflow: overrides.outflow ?? 12.54,
    runningBalance: overrides.runningBalance ?? 100,
    cleared: overrides.cleared ?? false,
    reconciled: overrides.reconciled ?? false,
    transferId: overrides.transferId,
    transferAccountId: overrides.transferAccountId,
    transferTransactionId: overrides.transferTransactionId,
    splitLines: overrides.splitLines,
  };
}

assert.equal(
  isUncategorisedRegisterTransaction(transaction()),
  true,
  "expense transactions without a category should be flagged",
);

assert.equal(
  isUncategorisedRegisterTransaction(
    transaction({ category: "Uncategorised", categoryId: "" }),
  ),
  true,
  "explicit Uncategorised expense transactions should be flagged",
);

assert.equal(
  isUncategorisedRegisterTransaction(
    transaction({ category: "Groceries", categoryId: "cat-groceries" }),
  ),
  false,
  "categorised expenses should not be flagged",
);

assert.equal(
  isUncategorisedRegisterTransaction(
    transaction({ inflow: 100, outflow: 0, category: "", categoryId: undefined }),
  ),
  false,
  "income should not be flagged as needing a spending category",
);

assert.equal(
  isUncategorisedRegisterTransaction(
    transaction({ transferAccountId: "savings", category: "", categoryId: undefined }),
  ),
  false,
  "transfers should not be flagged",
);

assert.equal(
  isUncategorisedRegisterTransaction(
    transaction({
      category: "Split",
      categoryId: "split",
      splitLines: [
        {
          id: "split-1",
          category: "Groceries",
          categoryId: "cat-groceries",
          outflow: 12.54,
          inflow: 0,
        },
      ],
    }),
  ),
  false,
  "split transactions should not be flagged when the parent category is a split container",
);

const registerColumnsSource = readFileSync(
  "apps/web/src/features/accounts/registerColumns.ts",
  "utf8",
);
const transactionRowSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const registerEditorSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const registerStylesSource = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.equal(
  registerColumnsSource.includes('id: "attention"'),
  false,
  "uncategorised workflow should not use a dedicated attention column",
);

assert.equal(
  transactionRowSource.includes("TransactionAttentionIndicator"),
  false,
  "transaction rows should not render a separate warning cell",
);

assert.match(
  transactionRowSource,
  /register-category-uncategorised-chip[\s\S]*⚠[\s\S]*Uncategorised/,
  "uncategorised warning should be rendered inside the category cell",
);

assert.match(
  transactionRowSource,
  /onEditTransactionCategory\(transaction\.id\)/,
  "clicking the uncategorised category chip should start category editing",
);

assert.match(
  registerEditorSource,
  /autoFocusField\?: "date" \| "category"/,
  "transaction editing should support focusing the category field directly",
);

assert.match(
  registerEditorSource,
  /openOnFocus=\{autoFocusField === "category"\}/,
  "category-focused editing should open category suggestions immediately",
);

assert.match(
  registerStylesSource,
  /\.register-row-uncategorised[\s\S]*#fff8e8/,
  "uncategorised rows should keep a subtle amber highlight",
);

assert.match(
  registerStylesSource,
  /\.register-category-uncategorised-chip[\s\S]*rgba\(251, 191, 36, 0\.18\)/,
  "uncategorised chip should use subtle amber styling",
);

console.log("v2.63.6 uncategorised transaction workflow checks passed");
