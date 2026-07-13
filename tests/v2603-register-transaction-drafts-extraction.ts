import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNewRegisterTransactionInput,
  buildUpdateRegisterTransactionInput,
} from "../apps/web/src/features/accounts/registerTransactionDrafts";
import { createSplitLineDraft } from "../apps/web/src/features/accounts/registerSplitDrafts";
import type { BudgetCategoryOption } from "../apps/web/src/features/budget/budgetViewTypes";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const categoryOptions: BudgetCategoryOption[] = [
  { id: "groceries", name: "Groceries", groupName: "Everyday" },
  { id: "ready", name: "Ready to Assign", groupName: "Income" },
];

function testExtractionBoundary() {
  const editorSource = read(
    "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  );
  const helperSource = read(
    "apps/web/src/features/accounts/registerTransactionDrafts.ts",
  );

  assert.match(
    editorSource,
    /from "\.\.\/registerTransactionDrafts"/,
    "RegisterTransactionEditor should use the extracted transaction draft helpers",
  );
  assert.match(
    helperSource,
    /export function buildNewRegisterTransactionInput/,
    "New transaction draft builder should live outside the editor component",
  );
  assert.match(
    helperSource,
    /export function buildUpdateRegisterTransactionInput/,
    "Update transaction draft builder should live outside the editor component",
  );
}

function testNewTransactionDraftBuildsCanonicalInput() {
  const input = buildNewRegisterTransactionInput({
    date: "2026-07-05",
    payee: "  Market  ",
    payeeId: "payee-market",
    category: "groceries",
    memo: "  weekly shop  ",
    checkNumber: "  104  ",
    outflow: "$42.30",
    inflow: "",
    splitLines: [],
    categoryOptions,
  });

  assert.deepEqual(input, {
    date: "2026-07-05",
    payee: "Market",
    payeeId: "payee-market",
    category: "Groceries",
    categoryId: "groceries",
    memo: "weekly shop",
    checkNumber: "104",
    outflow: 42.3,
    inflow: 0,
    splitLines: undefined,
  });
}

function testIncomeFallsBackToReadyToAssign() {
  const input = buildNewRegisterTransactionInput({
    date: "2026-07-05",
    payee: "Employer",
    category: "",
    memo: "",
    checkNumber: "",
    outflow: "",
    inflow: "1000",
    splitLines: [],
    categoryOptions,
  });

  assert.equal(input?.category, "Ready to Assign");
  assert.equal(input?.categoryId, "__ready_to_assign__");
}

function testInvalidDraftsReturnNull() {
  assert.equal(
    buildNewRegisterTransactionInput({
      date: "2026-07-05",
      payee: "   ",
      category: "Groceries",
      memo: "",
      checkNumber: "",
      outflow: "1",
      inflow: "",
      splitLines: [],
      categoryOptions,
    }),
    null,
    "Drafts without a payee should not build a transaction input",
  );

  const incompleteSplit = createSplitLineDraft();
  incompleteSplit.outflow = "5";

  assert.equal(
    buildNewRegisterTransactionInput({
      date: "2026-07-05",
      payee: "Market",
      category: "Split...",
      memo: "",
      checkNumber: "",
      outflow: "5",
      inflow: "",
      splitLines: [incompleteSplit],
      categoryOptions,
    }),
    null,
    "Incomplete split drafts should not build a transaction input",
  );
}

function testUpdateDraftKeepsTransactionId() {
  const input = buildUpdateRegisterTransactionInput({
    id: "transaction-1",
    date: "2026-07-05",
    payee: "Market",
    category: "Groceries",
    memo: "",
    checkNumber: "",
    outflow: "10",
    inflow: "",
    splitLines: [],
    categoryOptions,
  });

  assert.equal(input?.id, "transaction-1");
  assert.equal("flag" in (input ?? {}), false);
}

function testUpdateDraftPreservesExistingSplitDraftPermissiveness() {
  const validSplit = createSplitLineDraft();
  validSplit.category = "Groceries";
  validSplit.outflow = "10";

  const incompleteSplit = createSplitLineDraft();
  incompleteSplit.outflow = "5";

  const input = buildUpdateRegisterTransactionInput({
    id: "transaction-1",
    date: "2026-07-05",
    payee: "Market",
    category: "Split...",
    memo: "",
    checkNumber: "",
    outflow: "15",
    inflow: "",
    splitLines: [validSplit, incompleteSplit],
    categoryOptions,
  });

  assert.equal(input?.splitLines?.length, 1);
  assert.equal(input?.splitLines?.[0]?.category, "Groceries");
}

function run() {
  testExtractionBoundary();
  testNewTransactionDraftBuildsCanonicalInput();
  testIncomeFallsBackToReadyToAssign();
  testInvalidDraftsReturnNull();
  testUpdateDraftKeepsTransactionId();
  testUpdateDraftPreservesExistingSplitDraftPermissiveness();
  console.log("v2.60.3 register transaction draft extraction checks passed");
}

run();
