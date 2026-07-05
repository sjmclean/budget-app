import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSplitLineDraft } from "../apps/web/src/features/accounts/registerSplitDrafts";
import { buildNewRegisterTransactionInput } from "../apps/web/src/features/accounts/registerTransactionDrafts";
import { validateRegisterTransactionDraft } from "../apps/web/src/features/accounts/registerTransactionValidation";
import type { BudgetCategoryOption } from "../apps/web/src/features/budget/budgetViewTypes";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const categoryOptions: BudgetCategoryOption[] = [
  { id: "groceries", name: "Groceries", groupName: "Everyday" },
  { id: "transport", name: "Transport", groupName: "Everyday" },
];

function testExtractionBoundary() {
  const draftSource = read(
    "apps/web/src/features/accounts/registerTransactionDrafts.ts",
  );
  const validationSource = read(
    "apps/web/src/features/accounts/registerTransactionValidation.ts",
  );

  assert.match(
    draftSource,
    /from "\.\/registerTransactionValidation"/,
    "Transaction draft builders should delegate validation to the extracted helper",
  );
  assert.match(
    validationSource,
    /export function validateRegisterTransactionDraft/,
    "Transaction validation should live in its own focused module",
  );
  assert.doesNotMatch(
    draftSource,
    /hasIncompleteSplitDrafts/,
    "Split completeness validation should no longer live in the draft builder",
  );
}

function testMissingPayeeValidation() {
  const result = validateRegisterTransactionDraft({
    payee: "   ",
    outflow: "10",
    inflow: "",
    splitLines: [],
    categoryOptions,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, "missing-payee");
  assert.equal(result.parsedOutflow, 10);
  assert.equal(result.parsedInflow, 0);
}

function testBalancedSplitValidation() {
  const groceries = createSplitLineDraft();
  groceries.category = "Groceries";
  groceries.outflow = "7.50";

  const transport = createSplitLineDraft();
  transport.category = "Transport";
  transport.outflow = "2.50";

  const result = validateRegisterTransactionDraft({
    payee: "Market",
    outflow: "10",
    inflow: "",
    splitLines: [groceries, transport],
    categoryOptions,
  });

  assert.equal(result.isValid, true);
  assert.equal(result.reason, undefined);
  assert.equal(result.parsedSplitLines.length, 2);
}

function testUnbalancedSplitValidation() {
  const groceries = createSplitLineDraft();
  groceries.category = "Groceries";
  groceries.outflow = "4";

  const result = validateRegisterTransactionDraft({
    payee: "Market",
    outflow: "10",
    inflow: "",
    splitLines: [groceries],
    categoryOptions,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, "unbalanced-split-lines");
}

function testUpdatePermissivenessIsStillDrivenByDraftBuilder() {
  const incompleteSplit = createSplitLineDraft();
  incompleteSplit.outflow = "5";

  const input = buildNewRegisterTransactionInput({
    date: "2026-07-05",
    payee: "Market",
    category: "Split...",
    memo: "",
    checkNumber: "",
    outflow: "5",
    inflow: "",
    splitLines: [incompleteSplit],
    categoryOptions,
  });

  assert.equal(
    input,
    null,
    "New transaction builders should still reject incomplete split drafts",
  );
}

function run() {
  testExtractionBoundary();
  testMissingPayeeValidation();
  testBalancedSplitValidation();
  testUnbalancedSplitValidation();
  testUpdatePermissivenessIsStillDrivenByDraftBuilder();
  console.log("v2.60.4 register transaction validation extraction checks passed");
}

run();
