import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialSummary,
  type FinancialSummaryTransaction,
} from "../../../apps/web/src/pages/dashboard/services/financialSummaryService.js";

function transaction(
  overrides: Partial<FinancialSummaryTransaction> = {},
): FinancialSummaryTransaction {
  return {
    id: "tx",
    accountId: "account-1",
    date: "2026-09-01",
    attachmentCount: 0,
    payee: "Payee",
    category: "Uncategorised",
    inflow: 0,
    outflow: 0,
    runningBalance: 0,
    cleared: true,
    reconciled: false,
    ...overrides,
  };
}

test("financial summary distinguishes canonical inflow reporting classifications", () => {
  const summary = buildFinancialSummary([
    transaction({
      id: "salary",
      inflow: 1_000,
      incomeBudgetMonth: "2026-09",
      inflowClassification: "income",
    }),
    transaction({
      id: "counted-rebate",
      category: "Groceries",
      categoryId: "groceries",
      inflow: 200,
      inflowClassification: "income",
    }),
    transaction({
      id: "refund",
      category: "Groceries",
      categoryId: "groceries",
      inflow: 150,
      inflowClassification: "category-inflow",
    }),
    transaction({
      id: "uncategorised",
      inflow: 50,
    }),
    transaction({
      id: "expense",
      category: "Groceries",
      categoryId: "groceries",
      outflow: 400,
    }),
  ]);

  assert.deepEqual(summary, {
    income: 1_200,
    generalIncome: 1_000,
    countedCategoryIncome: 200,
    categoryInflows: 150,
    expenses: 400,
    savings: 800,
  });
});

test("financial summary excludes transfers and classifies split lines independently", () => {
  const summary = buildFinancialSummary([
    transaction({
      id: "transfer-parent",
      inflow: 2_000,
      transferAccountId: "savings",
    }),
    transaction({
      id: "split",
      inflow: 900,
      splitLines: [
        {
          id: "general-income",
          category: "Income for September",
          inflow: 500,
          outflow: 0,
          inflowClassification: "income",
          incomeBudgetMonth: "2026-09",
        },
        {
          id: "category-income",
          category: "Groceries",
          categoryId: "groceries",
          inflow: 100,
          outflow: 0,
          inflowClassification: "income",
        },
        {
          id: "refund",
          category: "Groceries",
          categoryId: "groceries",
          inflow: 100,
          outflow: 0,
          inflowClassification: "category-inflow",
        },
        {
          id: "internal-transfer",
          category: "Transfer",
          inflow: 200,
          outflow: 0,
          transferAccountId: "savings",
        },
      ],
    }),
  ]);

  assert.deepEqual(summary, {
    income: 600,
    generalIncome: 500,
    countedCategoryIncome: 100,
    categoryInflows: 100,
    expenses: 0,
    savings: 600,
  });
});
