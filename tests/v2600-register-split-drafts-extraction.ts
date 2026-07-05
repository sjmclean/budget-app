import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSplitLines,
  getSplitBalanceStatus,
  hasIncompleteSplitDrafts,
  isSplitDraftBalanced,
  parseRegisterMoney,
  splitDraftsFromTransaction,
  totalsFromSplitDrafts,
  type SplitLineDraft,
} from "../apps/web/src/features/accounts/registerSplitDrafts";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { BudgetCategoryOption } from "../apps/web/src/features/budget/budgetViewTypes";

const transactionEditorSource = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  ),
  "utf8",
);
const splitDraftSource = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/registerSplitDrafts.ts"),
  "utf8",
);

assert.match(
  transactionEditorSource,
  /from "\.\.\/registerSplitDrafts"/,
  "RegisterTransactionEditor should depend on the extracted split draft helper module",
);
assert.doesNotMatch(
  transactionEditorSource,
  /interface SplitLineDraft/,
  "Split draft shape should no longer be declared inside the React editor component",
);
assert.doesNotMatch(
  transactionEditorSource,
  /function buildSplitLines/,
  "Split line construction should no longer live inside the React editor component",
);
assert.doesNotMatch(
  transactionEditorSource,
  /function getSplitBalanceStatus/,
  "Split balancing rules should no longer live inside the React editor component",
);
assert.match(
  splitDraftSource,
  /export function buildSplitLines/,
  "Split draft module should own split line construction",
);
assert.match(
  splitDraftSource,
  /export function getSplitBalanceStatus/,
  "Split draft module should own split balancing rules",
);

const categoryOptions: BudgetCategoryOption[] = [
  { id: "cat-groceries", name: "Groceries", groupName: "Everyday" },
  { id: "cat-fuel", name: "Fuel", groupName: "Transport" },
];

const drafts: SplitLineDraft[] = [
  {
    id: "split-1",
    category: " groceries ",
    memo: " weekly shop ",
    outflow: "$45.10",
    inflow: "",
  },
  {
    id: "split-2",
    category: "cat-fuel",
    memo: "petrol",
    outflow: "54.90",
    inflow: "",
  },
  {
    id: "ignored-empty",
    category: "",
    memo: "",
    outflow: "",
    inflow: "",
  },
];

assert.equal(parseRegisterMoney("$1,234.56"), 1234.56);
assert.equal(parseRegisterMoney("not money"), 0);

assert.deepEqual(buildSplitLines(drafts, categoryOptions), [
  {
    id: "split-1",
    category: "Groceries",
    categoryId: "cat-groceries",
    memo: "weekly shop",
    outflow: 45.1,
    inflow: 0,
  },
  {
    id: "split-2",
    category: "Fuel",
    categoryId: "cat-fuel",
    memo: "petrol",
    outflow: 54.9,
    inflow: 0,
  },
]);

assert.deepEqual(totalsFromSplitDrafts(drafts), { outflow: 100, inflow: 0 });
assert.equal(isSplitDraftBalanced(100, 0, drafts), true);
assert.equal(isSplitDraftBalanced(90, 0, drafts), false);
assert.equal(
  hasIncompleteSplitDrafts([
    { id: "draft-1", category: "", memo: "", outflow: "12.00", inflow: "" },
  ]),
  true,
);
assert.deepEqual(
  getSplitBalanceStatus({
    parentOutflow: 100,
    parentInflow: 0,
    splitOutflow: 80,
    splitInflow: 0,
  }),
  {
    parentAmount: 100,
    splitAmount: 80,
    remaining: 20,
    isBalanced: false,
    isOverAssigned: false,
    activeSide: "outflow",
  },
);

const transaction = {
  splitLines: [
    {
      id: "line-1",
      category: "Groceries",
      categoryId: "cat-groceries",
      memo: undefined,
      outflow: 10,
      inflow: 0,
    },
  ],
} as RegisterTransactionView;

assert.deepEqual(splitDraftsFromTransaction(transaction), [
  {
    id: "line-1",
    category: "Groceries",
    categoryId: "cat-groceries",
    memo: "",
    outflow: "10.00",
    inflow: "",
  },
]);

console.log("v2.60.0 register split draft extraction checks passed");
