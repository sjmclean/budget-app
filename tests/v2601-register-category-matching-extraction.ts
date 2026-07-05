import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findCategoryOption,
  isSplitCategoryValue,
  normaliseCategoryName,
  SPLIT_CATEGORY_LABEL,
} from "../apps/web/src/features/accounts/registerCategoryMatching";
import type { BudgetCategoryOption } from "../apps/web/src/features/budget/budgetViewTypes";

const transactionEditorSource = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  ),
  "utf8",
);
const categoryMatchingSource = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/registerCategoryMatching.ts"),
  "utf8",
);

assert.match(
  transactionEditorSource,
  /from "\.\.\/registerCategoryMatching"/,
  "RegisterTransactionEditor should use the extracted category matching helpers",
);
assert.doesNotMatch(
  transactionEditorSource,
  /function normaliseCategoryName/,
  "Category name normalisation should no longer live inside the React editor component",
);
assert.doesNotMatch(
  transactionEditorSource,
  /function findCategoryOption/,
  "Category option matching should no longer live inside the React editor component",
);
assert.match(
  categoryMatchingSource,
  /export function normaliseCategoryName/,
  "Category matching module should own name normalisation",
);
assert.match(
  categoryMatchingSource,
  /export function findCategoryOption/,
  "Category matching module should own option lookup",
);

const categoryOptions: BudgetCategoryOption[] = [
  { id: "cat-groceries", name: "Groceries", groupName: "Everyday" },
  { id: "cat-ready-to-assign", name: "Ready to Assign", groupName: "Income" },
];

assert.equal(SPLIT_CATEGORY_LABEL, "Split...");
assert.equal(isSplitCategoryValue("split"), true);
assert.equal(isSplitCategoryValue(" Split... "), true);
assert.equal(isSplitCategoryValue("Groceries"), false);
assert.equal(normaliseCategoryName("Ready to Assign!"), "readytoassign");
assert.equal(findCategoryOption(" groceries ", categoryOptions)?.id, "cat-groceries");
assert.equal(findCategoryOption("cat-ready-to-assign", categoryOptions)?.name, "Ready to Assign");
assert.equal(findCategoryOption("missing", categoryOptions), undefined);

console.log("v2.60.1 register category matching extraction checks passed");
